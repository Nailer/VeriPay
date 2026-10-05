// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title  VeriPay Test Naira (vNGN)
 * @notice TESTNET STAND-IN for a naira stablecoin. 1 vNGN = ₦1 of *test* card
 *         payment — it is minted by VeriPay's server when Paystack (in test
 *         mode) confirms a charge, so a buyer can pay in naira and have exactly
 *         that amount locked in escrow, with no MON price to think about.
 *
 *         It is not money and is not redeemable. On mainnet this role belongs
 *         to a real, regulated asset (a licensed naira stablecoin such as
 *         cNGN, or AUSD with FX at the edges) — VeriPay should not be the
 *         issuer. VeriPayEscrow accepts any ERC-20, so swapping it is a config
 *         change, not a contract change.
 */
contract VeriPayTestNaira {
    string public constant name = "VeriPay Test Naira";
    string public constant symbol = "vNGN";
    uint8 public constant decimals = 6;

    address public owner;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event OwnershipTransferred(address indexed from, address indexed to);

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    function mint(address to, uint256 amount) external {
        require(msg.sender == owner, "not owner");
        require(to != address(0), "zero address");
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function transferOwnership(address newOwner) external {
        require(msg.sender == owner, "not owner");
        require(newOwner != address(0), "zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "allowance exceeded");
        if (allowed != type(uint256).max) allowance[from][msg.sender] = allowed - amount;
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) private {
        require(to != address(0), "zero address");
        require(balanceOf[from] >= amount, "insufficient balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}
