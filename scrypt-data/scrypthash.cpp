#include <iostream>
#include <iomanip>
#include <fstream>
#include <sstream>
#include <vector>
#include <map>
#include "scrypt.h"
#include "keccak-tiny.h"

template <typename Container>
std::string toHex(Container const& _data)
{
	std::ostringstream ret;
	ret << std::hex;
	for (auto i: _data)
		ret << std::setfill('0') << std::setw(2) << int(typename std::make_unsigned<decltype(i)>::type(i));
	return ret.str();
}

std::vector<uint8_t> sha3(std::vector<uint8_t> data)
{
	std::vector<uint8_t> out(32, 0);
	keccak::sha3_256(out.data(), 32, data.data(), data.size());
	return out;
}

/// Computes the root of a binary Merkle tree of the memory region between end and begin.
/// Uses very crude caching and a lot of unnecessary copy operations.
std::vector<uint8_t> merkleHash(std::vector<uint8_t>::const_iterator begin, std::vector<uint8_t>::const_iterator end)
{
	using MerkleCache = std::map<std::vector<uint8_t>, std::vector<uint8_t>>;
	static MerkleCache merkleCache;

	auto it = merkleCache.find(std::vector<uint8_t>(begin, end));
	if (it != merkleCache.end())
		return it->second;

	std::vector<uint8_t> ret;
	//std::cout << "Merkle hashisg data of size " << std::dec << (end - begin) << std::endl;
	if (end - begin <= 64)
		ret = sha3(std::vector<uint8_t>(begin, end));
	else
	{
		// This way to subdivide does not play well with memory resizing
		std::vector<uint8_t> left = merkleHash(begin, begin + (end - begin) / 2);
		std::vector<uint8_t> right = merkleHash(begin + (end - begin) / 2, end);
		std::copy(right.cbegin(), right.cend(), std::back_inserter(left));
		ret = sha3(left);
	}
	merkleCache.insert(it, MerkleCache::value_type(std::vector<uint8_t>(begin, end), ret));
	return ret;
}

int main(int argc, char *argv[])
{
    std::ifstream fin("input.data", std::ios::binary);
    // std::cout << "Error: " << strerror(errno);
    std::ostringstream ostrm;
    
    ostrm << fin.rdbuf();

	std::string indata = ostrm.str();
    
    indata.resize(80);
    
    std::cout << "Got string: " << indata << std::endl;

	char out[32];
	char scratchpad[SCRYPT_SCRATCHPAD_SIZE];

	unsigned wantedStep = 0;

	std::vector<uint8_t> data;
	data.resize(4 * 32 + 131072);
	scrypt_1024_1_1_256_sp_generic(indata.data(), &out[0], scratchpad, [&](unsigned i, char* X, char* V) {
		/* if (true || i == wantedStep) {
			uint32_t const* x = reinterpret_cast<uint32_t const*>(X);
			memcpy(data.data(), X, 4 * 32);
			memcpy(data.data() + 4 * 32, V, 131072);
			std::cout << "Root hash at step " << std::dec << i << ": " << toHex(merkleHash(data.begin(), data.end())) << std::endl;
			std::cout << "Internal state: " << std::endl;
			for (int ii = 0; ii < 32; ii++)
				std::cout << std::hex << x[ii] << " - ";
			std::cout << std::endl;
			std::cout << "    " << toHex(std::vector<uint8_t>(data.begin() + 0x00, data.begin() + 0x20)) << std::endl;
			std::cout << "    " << toHex(std::vector<uint8_t>(data.begin() + 0x20, data.begin() + 0x40)) << std::endl;
			std::cout << "    " << toHex(std::vector<uint8_t>(data.begin() + 0x40, data.begin() + 0x60)) << std::endl;
			std::cout << "    " << toHex(std::vector<uint8_t>(data.begin() + 0x60, data.begin() + 0x80)) << std::endl;
		} */
		//std::cout << std::dec << i << std::endl;
	});

	std::cout << "Scrypt output: " << toHex(out) << std::endl;
    std::ofstream fout("output.data", std::ios::binary);
    
    for (int i= 0; i < 32; i++) fout << out[i];
    
    fout.close();
    
}
