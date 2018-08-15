#!/bin/sh

solc --abi --optimize --overwrite --bin -o compiled contract.sol

em++ -c -I ~/openssl/include -std=c++11 scrypthash.cpp
em++ -c -I ~/openssl/include -std=c++11 scrypt.cpp
em++ -o scrypt.js scrypthash.o scrypt.o -L ~/openssl -lcrypto -lssl

g++ -O2 -c -std=c++11 scrypthash.cpp
g++ -O2 -c -std=c++11 scrypt.cpp
g++ -o scrypt.exe scrypthash.o scrypt.o -lcrypto -lssl

