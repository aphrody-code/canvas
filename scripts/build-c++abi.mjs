import { $ } from "bun";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const LLVM_VERSION = readFileSync(join(import.meta.dir, "..", "llvm-version"), "utf-8").trim();

await $`wget https://github.com/llvm/llvm-project/archive/refs/tags/llvmorg-${LLVM_VERSION}.zip`;

await $`unzip llvmorg-${LLVM_VERSION}.zip`;

await $`mkdir -p build`.cwd(`llvm-project-llvmorg-${LLVM_VERSION}`);

await $`cmake -G Ninja -S runtimes -B build -DCMAKE_BUILD_TYPE=Release -DLLVM_ENABLE_RUNTIMES="libcxx;libcxxabi;libunwind" -DLIBCXX_ENABLE_LOCALIZATION=OFF`
  .cwd(`llvm-project-llvmorg-${LLVM_VERSION}`)
  .env({ ...process.env, CXX: "clang++", CC: "clang", CXXFLAGS: "-fPIC" })
  ;

await $`ninja -C build cxx cxxabi`.cwd(`llvm-project-llvmorg-${LLVM_VERSION}`);

await $`cp llvm-project-llvmorg-${LLVM_VERSION}/build/lib/libc++abi.a .`;

await $`cp llvm-project-llvmorg-${LLVM_VERSION}/build/lib/libc++.a .`;
