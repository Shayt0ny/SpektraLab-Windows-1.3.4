// Copyright (C) 2026 shayt0ny. SPDX-License-Identifier: GPL-3.0-or-later
#define LIBRAW_LIBRARY_BUILD
#include <libraw/libraw.h>
#include <libraw/libraw_datastream.h>
#include <memory>
#include <vector>
#include <iostream>

class CanonData : public LibRaw {
public:
    void read(const std::vector<unsigned char>& bytes) {
        LibRaw_buffer_datastream stream(bytes.data(), bytes.size());
        libraw_internal_data.internal_data.input = &stream;
        libraw_internal_data.unpacker_data.order = 0x4949;
        parseCanonMakernotes(0x4001, 3, 3778, 0);
        libraw_internal_data.internal_data.input = nullptr;
    }
};

int main() {
    // Same record length, different layout. Use unequal channels and poisoned
    // old offsets so this catches a guessed common black level as well.
    for (unsigned version : {48u, 66u}) {
        std::vector<unsigned char> bytes(3778 * 2);
        auto put = [&](unsigned at, unsigned value) { bytes[at*2]=value&255; bytes[at*2+1]=value>>8; };
        put(0,version);
        for(unsigned c=0;c<4;++c) {
            put(0x69+c,1024+100*c);
            put(0x69+0x213+c,20+c);
            put(0x69+0x227+c,2048+10*c);
        }
        put(0x69+0x217,100);put(0x69+0x218,149);
        put(0x69+0x22b,15000);put(0x69+0x22c,15300);
        auto raw=std::make_unique<CanonData>();raw->read(bytes);
        const auto& canon=raw->imgdata.makernotes.canon;
        const unsigned map[4]={0,1,3,2};
        for(unsigned c=0;c<4;++c) {
            if(canon.ChannelBlackLevel[map[c]] != (version==66?2048+10*c:20+c)) return 1;
            if(raw->imgdata.color.cam_mul[map[c]] != 1024+100*c) return 2;
            if(raw->imgdata.color.linear_max[c] != (version==66?15300:149)) return 3;
        }
        if(canon.ColorDataVer != (version==66?12:11)) return 4;
    }
    std::cout<<"Canon ColorData 66 levels/WB and legacy 48 layout passed\n";
}
