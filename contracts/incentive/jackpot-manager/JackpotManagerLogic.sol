pragma solidity ^0.5.0;

import "../../openzeppelin-solidity/SafeMath.sol";
import "../TRU.sol";
import "./JackpotManagerState.sol";

contract JackpotManagerLogic is JackpotManagerState {
    using SafeMath for uint;

    event ReceivedJackpot(address receiver, uint amount);
    event JackpotIncreased(uint amount);

    // @dev – returns the current jackpot
    // @return – the jackpot.
    function getJackpotAmount() view public returns (uint) {
        return jackpots[currentJackpotID].amount;
    }

    function getCurrentJackpotID() view public returns (uint) {
        return currentJackpotID;
    }

    //// @dev – allows a uer to donate to the jackpot.
    //// @return – the updated jackpot amount.
    //function donateToJackpot() public payable {
    //    jackpots[currentJackpotID].amount = jackpots[currentJackpotID].amount.add(msg.value);
    //    emit JackpotIncreased(msg.value);
    //}

    function increaseJackpot(uint _amount) public payable {
        jackpots[currentJackpotID].amount = jackpots[currentJackpotID].amount.add(_amount);
        emit JackpotIncreased(_amount);
    } 

    function setJackpotReceivers(address[] memory _challengers) internal returns (uint) {
        jackpots[currentJackpotID].finalAmount = jackpots[currentJackpotID].amount;
        jackpots[currentJackpotID].challengers = _challengers;
        currentJackpotID = currentJackpotID + 1;
        return currentJackpotID - 1;
    }

    function getJackpotReceivers(uint jackpotID) public view returns (address[] memory) {
        Jackpot storage j = jackpots[jackpotID];
        return j.challengers;
    }

    function receiveJackpotPayment(uint jackpotID, uint index) public {
        Jackpot storage j = jackpots[jackpotID];
        require(j.challengers[index] == msg.sender);
        
        uint amount = j.finalAmount.div(2**(j.challengers.length-1));
        //transfer jackpot payment
        // token.mint(msg.sender, amount);
        token.transfer(msg.sender, amount);
        emit ReceivedJackpot(msg.sender, amount /*, j.finalAmount */);
    }
}
