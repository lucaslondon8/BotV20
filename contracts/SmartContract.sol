// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IPool} from "@aave/core-v3/contracts/interfaces/IPool.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IUniswapV2Router02} from "./IUniswapV2Router02.sol";

contract SmartContract {
    address public immutable owner;
    IPool public immutable aave;

    IUniswapV2Router02 public immutable router1;
    IUniswapV2Router02 public immutable router2;
    IUniswapV2Router02 public immutable router3;

    constructor(address _aave, address _r1, address _r2, address _r3) {
        owner = msg.sender;
        aave = IPool(_aave);
        router1 = IUniswapV2Router02(_r1);
        router2 = IUniswapV2Router02(_r2);
        router3 = IUniswapV2Router02(_r3);
    }

    function executeArbitrage(
        address tokenA,
        address[] calldata path1,
        address[] calldata path2,
        address[] calldata path3,
        uint256 amount,
        uint256[] calldata minOuts // [minOut1, minOut2, minOut3]
    ) external {
        require(msg.sender == owner, "Not authorized");
        require(minOuts.length == 3, "Invalid slippage data");

        bytes memory params = abi.encode(path1, path2, path3, minOuts);
        aave.flashLoanSimple(address(this), tokenA, amount, params, 0);
    }

    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address,
        bytes calldata params
    ) external returns (bool) {
        require(msg.sender == address(aave), "Only Aave");

        (
            address[] memory path1,
            address[] memory path2,
            address[] memory path3,
            uint256[] memory minOuts
        ) = abi.decode(params, (address[], address[], address[], uint256[]));

        uint256 balance = amount;

        // Swap 1
        if (path1.length > 1) {
            _approveIfNeeded(path1[0], address(router1), balance);
            uint256[] memory res = router1.swapExactTokensForTokens(
                balance, minOuts[0], path1, address(this), block.timestamp
            );
            balance = res[res.length - 1];
        }

        // Swap 2
        if (path2.length > 1) {
            _approveIfNeeded(path2[0], address(router2), balance);
            uint256[] memory res = router2.swapExactTokensForTokens(
                balance, minOuts[1], path2, address(this), block.timestamp
            );
            balance = res[res.length - 1];
        }

        // Swap 3
        if (path3.length > 1) {
            _approveIfNeeded(path3[0], address(router3), balance);
            uint256[] memory res = router3.swapExactTokensForTokens(
                balance, minOuts[2], path3, address(this), block.timestamp
            );
            balance = res[res.length - 1];
        }

        uint256 owed = amount + premium;
        require(balance >= owed, "Unprofitable arbitrage");

        // Safe raw approve
        require(IERC20(asset).approve(address(aave), owed), "Approve to Aave failed");

        // Transfer profit to owner
        require(IERC20(asset).transfer(owner, balance - owed), "Profit transfer failed");

        return true;
    }

    function _approveIfNeeded(address token, address spender, uint256 amount) internal {
        uint256 allowance = IERC20(token).allowance(address(this), spender);
        if (allowance < amount) {
            require(IERC20(token).approve(spender, type(uint256).max), "Router approve failed");
        }
    }
}

