
pragma solidity ^0.4.16;

interface Filesystem {

   function createFileWithContents(string name, uint nonce, bytes32[] arr, uint sz) external returns (bytes32);
   function getSize(bytes32 id) external view returns (uint);
   function getRoot(bytes32 id) external view returns (bytes32);
   function getData(bytes32 id) external view returns (bytes32[]);
   function forwardData(bytes32 id, address a) external;
   
   // function makeSimpleBundle(uint num, address code, bytes32 code_init, bytes32 file_id) public returns (bytes32);
   
   function makeBundle(uint num) external view returns (bytes32);
   function addToBundle(bytes32 id, bytes32 file_id) external returns (bytes32);
   function finalizeBundleIPFS(bytes32 id, string file, bytes32 init) external;
   function getInitHash(bytes32 bid) external view returns (bytes32);
   
   function debug_finalizeBundleIPFS(bytes32 id, string file, bytes32 init) external returns (bytes32, bytes32, bytes32, bytes32, bytes32);
   
}

interface TrueBit {
   function add(bytes32 init, /* CodeType */ uint8 ct, /* Storage */ uint8 cs, string stor) external returns (uint);
   function addWithParameters(bytes32 init, /* CodeType */ uint8 ct, /* Storage */ uint8 cs, string stor, uint8 stack, uint8 mem, uint8 globals, uint8 table, uint8 call) external returns (uint);
   function requireFile(uint id, bytes32 hash, /* Storage */ uint8 st) external;
   function commit(uint id) external;
}

contract Scrypt {

   event GotFiles(bytes32[] files);
   event Consuming(bytes32[] arr);
   
   event InputData(bytes32[] data);

   uint nonce;
   TrueBit truebit;
   Filesystem filesystem;

   string code;
   bytes32 init;

   mapping (bytes => bytes32) string_to_file; 
   mapping (uint => bytes) task_to_string;
   mapping (bytes => bytes32) result;

   constructor(address tb, address fs, string code_address, bytes32 init_hash) public {
      truebit = TrueBit(tb);
      filesystem = Filesystem(fs);
      code = code_address;     // address for wasm file in IPFS
      init = init_hash;        // the canonical hash
   }

   function submitData(bytes data) public returns (bytes32) {
      uint num = nonce;
      nonce++;
      bytes32[] memory input = new bytes32[](data.length/32+1);
      for (uint i = 0; i <= data.length/32; i++) {
         uint a;
         for (uint j = 0; j < 32; j++) {
            a = a*256;
            if (i*32+j < data.length) a += uint(data[i*32+j]);
         }
         input[i] = bytes32(a);
      }
      emit InputData(input);
      bytes32 input_file = filesystem.createFileWithContents("input.data", num, input, data.length);
      string_to_file[data] = input_file;
      bytes32 bundle = filesystem.makeBundle(num);
      filesystem.addToBundle(bundle, input_file);
      bytes32[] memory empty = new bytes32[](0);
      filesystem.addToBundle(bundle, filesystem.createFileWithContents("output.data", num+1000000000, empty, 0));
      filesystem.finalizeBundleIPFS(bundle, code, init);
      
      uint task = truebit.addWithParameters(filesystem.getInitHash(bundle), 1, 1, idToString(bundle), 20, 20, 8, 20, 10);
      truebit.requireFile(task, hashName("output.data"), 0);
      // truebit.commit(task);
      task_to_string[task] = data;
      
      return filesystem.getInitHash(bundle);
   }

   uint remember_task;

   /*
   function consume(bytes32, bytes32[] arr) public {
      emit Consuming(arr);
      require(Filesystem(msg.sender) == filesystem);
      result[task_to_string[remember_task]] = arr[0];
   }*/

   // this is the callback name
   function solved(uint id, bytes32[] files) public {
      // could check the task id
      require(TrueBit(msg.sender) == truebit);
      remember_task = id;
      emit GotFiles(files);
      bytes32[] memory arr = filesystem.getData(files[0]);
      emit Consuming(arr);
      result[task_to_string[remember_task]] = arr[0];
      // filesystem.forwardData(files[0], this);
   }

   // need some way to get next state, perhaps shoud give all files as args
   function scrypt(bytes data) public view returns (bytes32) {
      return result[data];
   }
   
   ///// Utils

   function idToString(bytes32 id) public pure returns (string) {
      bytes memory res = new bytes(64);
      for (uint i = 0; i < 64; i++) res[i] = bytes1(((uint(id) / (2**(4*i))) & 0xf) + 65);
      return string(res);
   }

   function makeMerkle(bytes arr, uint idx, uint level) internal pure returns (bytes32) {
      if (level == 0) return idx < arr.length ? bytes32(uint(arr[idx])) : bytes32(0);
      else return keccak256(makeMerkle(arr, idx, level-1), makeMerkle(arr, idx+(2**(level-1)), level-1));
   }

   function calcMerkle(bytes32[] arr, uint idx, uint level) internal returns (bytes32) {
      if (level == 0) return idx < arr.length ? arr[idx] : bytes32(0);
      else return keccak256(calcMerkle(arr, idx, level-1), calcMerkle(arr, idx+(2**(level-1)), level-1));
   }

   // assume 256 bytes?
   function hashName(string name) public pure returns (bytes32) {
      return makeMerkle(bytes(name), 0, 8);
   }

}
