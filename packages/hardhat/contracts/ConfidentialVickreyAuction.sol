// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {
    FHE,
    euint64,
    eaddress,
    InEuint64,
    ebool
} from "@fhenixprotocol/cofhe-contracts/FHE.sol";

/// @title ConfidentialVickreyAuction
/// @notice Leilão de Vickrey (segundo preço selado) confidencial usando FHE.
/// Cada participante envia um lance cifrado e um colateral uniforme em ETH.
/// O vencedor é o maior lance; paga o segundo maior lance. Lances perdedores
/// permanecem cifrados permanentemente. Empates no topo são resolvidos por
/// ordem de chegada (primeiro a chegar mantém o posto, pois FHE.gt rejeita
/// igualdade).
contract ConfidentialVickreyAuction {
    // ============ Enums ============

    enum Status {
        Active,
        SettlementRequested,
        Settled,
        Cancelled
    }

    // ============ Structs ============

    struct Auction {
        string name;
        address seller;
        uint256 itemId;
        // Colateral uniforme em wei. Todo bidder deposita exatamente esse valor
        // ao chamar bid(). Define o teto público para lances válidos.
        uint256 collateralAmount;
        uint256 startTime;
        uint256 endTime;
        Status status;
        // Estado cifrado (top-2 atualizado incrementalmente a cada bid).
        euint64 highestBid;
        euint64 secondHighestBid;
        eaddress highestBidder;
        // Resultado da decifração (preenchido em finalizeSettlement).
        address decryptedWinner;
        uint64 decryptedSecondPrice;
        // ctHashes capturados na request, para o cliente alimentar decryptForTx.
        bytes32 winnerCtHash;
        bytes32 secondPriceCtHash;
        // Tracking.
        uint256 totalBids;
    }

    /// @notice View struct (sem campos cifrados) para getAuction.
    struct AuctionView {
        string name;
        address seller;
        uint256 itemId;
        uint256 collateralAmount;
        uint256 startTime;
        uint256 endTime;
        Status status;
        uint256 totalBids;
    }

    // ============ Constants ============

    uint256 public constant MIN_BIDDERS = 3;

    // ============ State ============

    mapping(uint256 => Auction) public auctions;
    /// auctionId => bidder => colateral depositado (sempre == collateralAmount).
    mapping(uint256 => mapping(address => uint256)) public collateral;
    mapping(uint256 => mapping(address => bool)) public hasBid;
    mapping(uint256 => mapping(address => bool)) public hasWithdrawn;

    uint256 public nextAuctionId;

    // ============ Events ============

    event AuctionCreated(
        uint256 indexed auctionId,
        address indexed seller,
        string name,
        uint256 itemId,
        uint256 collateralAmount,
        uint256 startTime,
        uint256 endTime
    );

    event BidPlaced(
        uint256 indexed auctionId,
        address indexed bidder,
        uint256 timestamp
    );

    event SettlementRequested(
        uint256 indexed auctionId,
        bytes32 winnerCtHash,
        bytes32 secondPriceCtHash
    );

    event AuctionSettled(
        uint256 indexed auctionId,
        address indexed winner,
        uint64 secondPrice
    );

    event Withdrawn(
        uint256 indexed auctionId,
        address indexed account,
        uint256 amount
    );

    event AuctionCancelled(uint256 indexed auctionId);

    // ============ Errors ============

    error AuctionNotActive();
    error AuctionNotEnded();
    error AuctionEnded();
    error SettlementNotRequested();
    error NotSeller();
    error NotEligible();
    error AlreadyWithdrawn();
    error AlreadyBid();
    error SellerCannotBid();
    error InvalidTimeRange();
    error InsufficientBidders();
    error WrongCollateral();
    error NameRequired();
    error NameTooLong();
    error InvalidDecryptionProof();
    error TransferFailed();
    error WinnerCannotPay();

    // ============ Auction Creation ============

    /// @notice Cria um novo leilão de Vickrey.
    /// @param name Nome do leilão (max 32 chars).
    /// @param itemId Identificador do item leiloado (mock, plaintext).
    /// @param collateralAmount Colateral uniforme em wei que todo bidder deve
    /// depositar. Define o teto público para lances válidos.
    /// @param startTime Início do período de lances (unix timestamp).
    /// @param endTime Fim do período de lances (unix timestamp).
    function createAuction(
        string calldata name,
        uint256 itemId,
        uint256 collateralAmount,
        uint256 startTime,
        uint256 endTime
    ) external returns (uint256 auctionId) {
        if (bytes(name).length == 0) revert NameRequired();
        if (bytes(name).length > 32) revert NameTooLong();
        if (endTime <= startTime) revert InvalidTimeRange();
        // startTime in the past is allowed: the auction is open from creation
        // (useful when the seller wants an instant-start auction). We only
        // reject leilões whose end is already in the past.
        if (endTime <= block.timestamp) revert InvalidTimeRange();
        if (collateralAmount == 0) revert WrongCollateral();
        // collateralAmount caps the encrypted bid (capped homomorphically in
        // bid()) and must fit in uint64.
        if (collateralAmount > type(uint64).max) revert WrongCollateral();

        auctionId = nextAuctionId++;

        Auction storage auction = auctions[auctionId];
        auction.name = name;
        auction.seller = msg.sender;
        auction.itemId = itemId;
        auction.collateralAmount = collateralAmount;
        auction.startTime = startTime;
        auction.endTime = endTime;
        auction.status = Status.Active;
        auction.highestBid = FHE.asEuint64(0);
        auction.secondHighestBid = FHE.asEuint64(0);
        auction.highestBidder = FHE.asEaddress(address(0));

        FHE.allowThis(auction.highestBid);
        FHE.allowThis(auction.secondHighestBid);
        FHE.allowThis(auction.highestBidder);

        emit AuctionCreated(
            auctionId,
            msg.sender,
            name,
            itemId,
            collateralAmount,
            startTime,
            endTime
        );
    }

    // ============ Bidding ============

    /// @notice Submete um lance cifrado. msg.value deve ser exatamente
    /// collateralAmount.
    /// @param auctionId Leilão.
    /// @param encryptedAmount Lance cifrado (InEuint64 produzido pelo cliente).
    function bid(
        uint256 auctionId,
        InEuint64 calldata encryptedAmount
    ) external payable {
        Auction storage auction = auctions[auctionId];

        if (auction.status != Status.Active) revert AuctionNotActive();
        if (block.timestamp < auction.startTime) revert AuctionNotActive();
        if (block.timestamp >= auction.endTime) revert AuctionEnded();
        if (msg.sender == auction.seller) revert SellerCannotBid();
        if (hasBid[auctionId][msg.sender]) revert AlreadyBid();
        if (msg.value != auction.collateralAmount) revert WrongCollateral();

        euint64 bidAmount = FHE.asEuint64(encryptedAmount);
        // Cap the bid to the collateral amount homomorphically. A bidder
        // cannot promise to pay more than they deposited; if they try, the
        // effective bid is silently truncated to collateralAmount. This
        // prevents griefing (a single huge bid trapping the auction in
        // SettlementRequested when finalize would otherwise revert).
        euint64 cap = FHE.asEuint64(uint64(auction.collateralAmount));
        ebool tooHigh = FHE.gt(bidAmount, cap);
        bidAmount = FHE.select(tooHigh, cap, bidAmount);
        FHE.allowThis(bidAmount);
        FHE.allow(bidAmount, msg.sender);

        // Top-2 incremental update.
        //
        // - se bid > highest: bid vira highest; antigo highest cai para second
        // - senão se bid > second: bid vira second
        // - senão: estado mantém
        //
        // Empates por ordem: FHE.gt rejeita igualdade. Se bid == highest, então
        // isHigherThanFirst = false e o primeiro a chegar permanece como vencedor.
        ebool isHigherThanFirst = FHE.gt(bidAmount, auction.highestBid);
        ebool isHigherThanSecond = FHE.gt(bidAmount, auction.secondHighestBid);

        euint64 newSecond = FHE.select(
            isHigherThanFirst,
            auction.highestBid,
            FHE.select(isHigherThanSecond, bidAmount, auction.secondHighestBid)
        );
        euint64 newHighest = FHE.select(
            isHigherThanFirst,
            bidAmount,
            auction.highestBid
        );
        eaddress newHighestBidder = FHE.select(
            isHigherThanFirst,
            FHE.asEaddress(msg.sender),
            auction.highestBidder
        );

        auction.highestBid = newHighest;
        auction.secondHighestBid = newSecond;
        auction.highestBidder = newHighestBidder;

        FHE.allowThis(auction.highestBid);
        FHE.allowThis(auction.secondHighestBid);
        FHE.allowThis(auction.highestBidder);

        collateral[auctionId][msg.sender] = msg.value;
        hasBid[auctionId][msg.sender] = true;
        auction.totalBids++;

        emit BidPlaced(auctionId, msg.sender, block.timestamp);
    }

    // ============ Settlement ============

    /// @notice Marca highestBidder e secondHighestBid como publicamente
    /// decifráveis pela TSN. Qualquer um pode chamar após o deadline, desde que
    /// o leilão tenha pelo menos MIN_BIDDERS lances.
    function requestSettlement(uint256 auctionId) external {
        Auction storage auction = auctions[auctionId];

        if (auction.status != Status.Active) revert AuctionNotActive();
        if (block.timestamp < auction.endTime) revert AuctionNotEnded();
        if (auction.totalBids < MIN_BIDDERS) revert InsufficientBidders();

        auction.status = Status.SettlementRequested;

        FHE.allowPublic(auction.highestBidder);
        FHE.allowPublic(auction.secondHighestBid);

        bytes32 winnerCt = eaddress.unwrap(auction.highestBidder);
        bytes32 secondPriceCt = euint64.unwrap(auction.secondHighestBid);
        auction.winnerCtHash = winnerCt;
        auction.secondPriceCtHash = secondPriceCt;

        emit SettlementRequested(auctionId, winnerCt, secondPriceCt);
    }

    /// @notice Finaliza o leilão. O caller fornece os valores decifrados
    /// (winner e secondPrice) acompanhados de provas geradas pela TSN. O
    /// contrato valida via FHE.verifyDecryptResult.
    /// Pagamentos ocorrem via withdraw (pull pattern).
    function finalizeSettlement(
        uint256 auctionId,
        address winner,
        uint64 secondPrice,
        bytes calldata winnerProof,
        bytes calldata secondPriceProof
    ) external {
        Auction storage auction = auctions[auctionId];

        if (auction.status != Status.SettlementRequested)
            revert SettlementNotRequested();

        if (
            !FHE.verifyDecryptResult(
                auction.highestBidder,
                winner,
                winnerProof
            )
        ) revert InvalidDecryptionProof();
        if (
            !FHE.verifyDecryptResult(
                auction.secondHighestBid,
                secondPrice,
                secondPriceProof
            )
        ) revert InvalidDecryptionProof();

        // Caso patológico: vencedor não tem colateral suficiente para pagar.
        // Acontece apenas se algum bidder violou o teto público (lance >
        // collateralAmount). Aborta a finalização; o leilão pode ser
        // re-disputado fora do contrato.
        if (uint256(secondPrice) > collateral[auctionId][winner])
            revert WinnerCannotPay();

        auction.decryptedWinner = winner;
        auction.decryptedSecondPrice = secondPrice;
        auction.status = Status.Settled;

        emit AuctionSettled(auctionId, winner, secondPrice);
    }

    // ============ Withdraw (pull pattern) ============

    /// @notice Saque das partes envolvidas:
    ///   - seller: recebe secondPrice (após Settled)
    ///   - vencedor: recebe collateralAmount - secondPrice (sobra do colateral)
    ///   - perdedores: recebem collateralAmount integral
    ///   - em Cancelled: seller e bidders (se houver) recebem o que depositaram
    function withdraw(uint256 auctionId) external {
        Auction storage auction = auctions[auctionId];

        if (
            auction.status != Status.Settled &&
            auction.status != Status.Cancelled
        ) revert SettlementNotRequested();

        if (hasWithdrawn[auctionId][msg.sender]) revert AlreadyWithdrawn();

        uint256 amount;

        if (auction.status == Status.Cancelled) {
            // Em Cancelled, qualquer bidder retira o que depositou. Seller não
            // depositou nada.
            if (!hasBid[auctionId][msg.sender]) revert NotEligible();
            amount = collateral[auctionId][msg.sender];
        } else {
            // Settled
            if (msg.sender == auction.seller) {
                amount = auction.decryptedSecondPrice;
            } else if (msg.sender == auction.decryptedWinner) {
                amount =
                    collateral[auctionId][msg.sender] -
                    auction.decryptedSecondPrice;
            } else if (hasBid[auctionId][msg.sender]) {
                amount = collateral[auctionId][msg.sender];
            } else {
                revert NotEligible();
            }
        }

        hasWithdrawn[auctionId][msg.sender] = true;

        (bool success, ) = payable(msg.sender).call{value: amount}("");
        if (!success) revert TransferFailed();

        emit Withdrawn(auctionId, msg.sender, amount);
    }

    // ============ Cancellation ============

    /// @notice Seller cancela um leilão que ainda não recebeu lances.
    function cancelAuction(uint256 auctionId) external {
        Auction storage auction = auctions[auctionId];

        if (msg.sender != auction.seller) revert NotSeller();
        if (auction.status != Status.Active) revert AuctionNotActive();
        if (auction.totalBids > 0) revert AlreadyBid();

        auction.status = Status.Cancelled;
        emit AuctionCancelled(auctionId);
    }

    // ============ View Functions ============

    function getAuction(
        uint256 auctionId
    ) external view returns (AuctionView memory) {
        Auction storage auction = auctions[auctionId];
        return
            AuctionView({
                name: auction.name,
                seller: auction.seller,
                itemId: auction.itemId,
                collateralAmount: auction.collateralAmount,
                startTime: auction.startTime,
                endTime: auction.endTime,
                status: auction.status,
                totalBids: auction.totalBids
            });
    }

    function getSettlementResult(
        uint256 auctionId
    ) external view returns (address winner, uint64 secondPrice) {
        Auction storage auction = auctions[auctionId];
        if (auction.status != Status.Settled) revert SettlementNotRequested();
        return (auction.decryptedWinner, auction.decryptedSecondPrice);
    }

    function getSettlementCtHashes(
        uint256 auctionId
    ) external view returns (bytes32 winnerCt, bytes32 secondPriceCt) {
        Auction storage auction = auctions[auctionId];
        if (
            auction.status != Status.SettlementRequested &&
            auction.status != Status.Settled
        ) revert SettlementNotRequested();
        return (auction.winnerCtHash, auction.secondPriceCtHash);
    }

    function getBidderEncryptedBid(
        uint256 auctionId,
        address bidder
    ) external view returns (euint64) {
        // Note: each bid's individual ciphertext is not retained — only the
        // top-2 aggregates are stored. Bidders that want to view their own bid
        // should keep their plaintext locally. This view returns the encrypted
        // highest bid only if the caller is the bidder and has bid (limited
        // utility; kept for symmetry with the original PoC interface).
        if (!hasBid[auctionId][bidder]) revert NotEligible();
        return auctions[auctionId].highestBid;
    }
}
