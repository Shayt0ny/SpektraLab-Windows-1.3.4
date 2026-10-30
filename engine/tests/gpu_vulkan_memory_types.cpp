#include "gpu/vulkan_memory.hpp"
#include <cstdio>
#include <cstring>
#include <stdexcept>
using namespace spk::gpu;
constexpr uint64_t MiB=1ull<<20;
void require(bool b,const char* text){if(!b)throw std::runtime_error(text);}
int main(int argc,char** argv){try{
    VkPhysicalDeviceMemoryProperties p{};p.memoryHeapCount=2;p.memoryTypeCount=2;
    p.memoryHeaps[0]={369*MiB,VK_MEMORY_HEAP_DEVICE_LOCAL_BIT};p.memoryHeaps[1]={16ull<<30,0};
    p.memoryTypes[0]={VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT,0};
    p.memoryTypes[1]={VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT|VK_MEMORY_PROPERTY_HOST_COHERENT_BIT|VK_MEMORY_PROPERTY_HOST_CACHED_BIT,1};
    std::array<uint64_t,VK_MAX_MEMORY_HEAPS> left{};left[0]=231*MiB;left[1]=15ull<<30;
    const bool legacy=argc>1&&std::strcmp(argv[1],"--legacy")==0;
    auto choose=[&](uint32_t bits,uint64_t size,bool staging=false,bool readback=false){
        if(legacy&&!staging)bits&=1; // Deliberately reproduce the old device-local-only policy.
        auto candidates=vulkan_memory_candidates(p,bits,left,staging,readback);
        for(const auto& c:candidates)if(c.available>=size)return c.index;return UINT32_MAX;
    };
    require(choose(3,233*MiB)==1,"233 MiB request must use compatible shared heap when local has only 231 MiB");
    left[0]=300*MiB;require(choose(3,233*MiB)==0,"sufficient local memory must remain preferred");
    left[0]=120*MiB;left[1]=120*MiB;require(choose(3,233*MiB)==UINT32_MAX,"separate heaps must not be added together for one allocation");
    left[1]=15ull<<30;require(choose(1,233*MiB)==UINT32_MAX,"memoryTypeBits must not be bypassed");
    p.memoryTypes[1].propertyFlags|=VK_MEMORY_PROPERTY_PROTECTED_BIT;require(choose(3,233*MiB)==UINT32_MAX,"protected memory cannot back an ordinary buffer");
    p.memoryTypes[1].propertyFlags&=~VK_MEMORY_PROPERTY_PROTECTED_BIT;
    const auto ordinary=p.memoryTypes[1].propertyFlags;
    p.memoryTypes[1].propertyFlags=0;require(choose(3,233*MiB)==1,"GPU-compatible system memory does not require CPU mapping");
    p.memoryTypes[1].propertyFlags=ordinary|VK_MEMORY_PROPERTY_DEVICE_COHERENT_BIT_AMD;
    require(choose(3,233*MiB)==UINT32_MAX,"unenabled AMD device-coherent feature must be excluded");
    p.memoryTypes[1].propertyFlags=ordinary;
    require(choose(3,4*MiB,true,true)==1,"readback staging must remain host visible and cached");
    p.memoryTypes[0].propertyFlags|=VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT;left[0]=8ull<<30;
    require(choose(1,233*MiB)==0,"unified local/host-visible UMA heap must be accepted");
    std::puts("memory types: 233/231 MiB shared fallback, local preference, no heap summation, compatibility, protected memory, staging and UMA passed");return 0;
}catch(const std::exception& e){std::fprintf(stderr,"memory types: %s\n",e.what());return 1;}}
