#!/bin/sh

solc --abi --optimize --overwrite --bin -o compiled contract.sol

em++ -c -I ~/openssl/include -std=c++11 scrypthash.cpp
em++ -c -I ~/openssl/include -std=c++11 scrypt.cpp
em++ -o scrypt.js scrypthash.o scrypt.o -L ~/openssl -lcrypto -lssl

node ~/emscripten-module-wrapper/prepare.js scrypt.js --file input.data --file output.data --memory-size 20 --out=stuff --metering=5000 --upload-ipfs --limit-stack

g++ -O2 -c -std=c++11 scrypthash.cpp
g++ -O2 -c -std=c++11 scrypt.cpp
g++ -o scrypt.exe scrypthash.o scrypt.o -lcrypto -lssl

