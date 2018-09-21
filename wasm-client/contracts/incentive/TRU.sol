pragma solidity ^0.4.24;

import "../openzeppelin-solidity/MintableToken.sol";
import "../openzeppelin-solidity/BurnableToken.sol";

contract TRU is MintableToken, BurnableToken {
    string public constant name = "TRU Token";
    string public constant symbol = "TRU";
    uint8 public constant decimals = 8;

    event Burn(address indexed from, uint256 amount);

    
    function () public payable {
        if (msg.value > 0) {
            balances[msg.sender] += msg.value;
            totalSupply_ = totalSupply_.add(msg.value);
        }
    }
    /*
    function burn(address _from, uint _amount) onlyOwner returns (bool) {
    }

    function burn(uint _amount) onlyOwner public returns (bool) {
        address _from = msg.sender;
        require(balances[_from] >= _amount);
        totalSupply_ = totalSupply_.sub(_amount);
        balances[_from] = balances[_from].sub(_amount);
        emit Burn(_from, _amount);
        return true;
    }*/
}
