FROM mrsmkl/truebit-base:6.0.0
MAINTAINER Sami Mäkelä

SHELL ["/bin/bash", "-c"]


RUN wget https://dist.ipfs.io/go-ipfs/v0.4.17/go-ipfs_v0.4.17_linux-amd64.tar.gz \
 && tar xf go-ipfs_v0.4.17_linux-amd64.tar.gz \
 && cd go-ipfs \
 && ./install.sh \
 && ipfs init \
 && cd / \
 && rm -rf go-ipfs*

RUN apt-get  update \
 && apt-get install -y git cmake ninja-build g++ python wget ocaml opam libzarith-ocaml-dev m4 pkg-config zlib1g-dev psmisc sudo curl tmux nano npm apache2 \
 && opam init -y \
 && npm install -g ganache-cli mocha browserify

# RUN wget -O rustup.sh https://sh.rustup.rs \
# && sh rustup.sh -y \
# && source $HOME/.cargo/env \
# && rustup toolchain add stable \
# && git clone https://github.com/goerli/parity-goerli.git \
# && cd parity-goerli \
# && source $HOME/.cargo/env \
# && apt-get install -y libudev-dev \
# && cargo build --release --features final \
# && cd / \
# && cp /parity-goerli/target/release/parity /bin \
# && rm -rf /parity-goerli ~/.rustup ~/.cargo

RUN cd bin \
 && wget https://github.com/ethereum/solidity/releases/download/v0.5.2/solc-static-linux \
 && mv solc-static-linux solc \
 && chmod 744 solc

RUN git clone https://github.com/TruebitFoundation/truebit-os \
 && cd truebit-os \
 && git checkout mono-2 \
 && cd jit-runner \
 && npm i

RUN eval `opam config env` \
 && apt-get install libffi-dev \
 && opam update \
 && opam install cryptokit yojson ctypes ctypes-foreign -y \
 && cd truebit-os/ocaml-offchain/interpreter \
 && make

RUN cd truebit-os/emscripten-module-wrapper \
 && source /emsdk/emsdk_env.sh \
 && npm install \
 && ln -s /truebit-os/emscripten-module-wrapper /root/emscripten-module-wrapper

RUN cd truebit-os/wasm-ports \
 && source /emsdk/emsdk_env.sh \
 && export EMCC_WASM_BACKEND=1 \
 && apt-get install -y lzip autoconf libtool flex bison \
 && sh gmp.sh \
 && sh openssl.sh \
 && sh secp256k1.sh \
 && sh libff.sh \
 && sh boost.sh \
 && sh libpbc.sh

RUN cd truebit-os \
 && npm i --production \
 && npm run deps \
 && npm run  compile \
 && rm -rf ~/.opam

RUN cd truebit-os/wasm-ports/samples/pairing \
 && source  /emsdk/emsdk_env.sh \
 && ( ipfs daemon & ) \
 && export EMCC_WASM_BACKEND=1 \
 && sh compile.sh \
 && cd ../scrypt \
 && sh compile.sh \
 && cd ../chess \
 && sh compile.sh

RUN cd truebit-os/wasm-ports/samples/ffmpeg \
 && source  /emsdk/emsdk_env.sh \
 && ( ipfs daemon & ) \
 && sh compile.sh

RUN cd truebit-os/wasm-ports/samples \
 && npm i

EXPOSE 4001 30303 80 8545
