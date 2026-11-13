#define _POSIX_C_SOURCE 200809L
/* Test-only CUPS raster fixture for 80mm, 203 DPI, default and opt-in fit. */
#include <cups/raster.h>
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <unistd.h>

#define ROW 72
#define HEIGHT 2374
static int draw(cups_raster_t *r,const cups_page_header2_t *h,int footer,int check) {
    unsigned char row[ROW];
    unsigned first_x=10000,last_x=0,first_y=10000,last_y=0;
    for (unsigned int y=0;y<h->cupsHeight;++y) {
        unsigned want=0;
        if ((y>=100 && y<=101)||(y>=300&&y<=350))want=1;
        if (footer==1 && y>=2310 && y<=2314)want=1; /* browser print footer */
        if (footer==2 && y>=1800 && y<=1840)want=1; /* real QR/signature */
        if (footer==3 && y>=100 && y<=400)want=1; /* narrow but substantive receipt */
        if (check) {
            if (cupsRasterReadPixels(r,row,ROW)!=ROW)return 2;
            if (footer==3) {
                for (unsigned i=0;i<ROW;i++)if (row[i]!=0) {
                    if(i*8<first_x)first_x=i*8;
                    if(i*8+7>last_x)last_x=i*8+7;
                    if(y<first_y)first_y=y;
                    if(y>last_y)last_y=y;
                }
                continue;
            }
            if ((y==100||y==350||(footer==2 && y==1800)) &&
                (row[9]!=0xff || row[10]!=0xff))return 3;
            if (y==0 && row[9]!=0x00)return 4; /* untouched top */
        } else {
            memset(row,0,ROW);
            if (want) {
                if(footer==3)for(unsigned i=10;i<=55;i++)row[i]=0xff;
                else row[9]=row[10]=0xff;
            }
            if (cupsRasterWritePixels(r,row,ROW)!=ROW)return 5;
        }
    }
    if(check && footer==3) {
        if(first_x>28 || last_x<515 || first_y>32 || last_y<360)return 14;
    }
    return 0;
}
int main(int argc,char **argv){
    if(argc!=4){fprintf(stderr,"usage: fixture write|check footer|qr|none filename\n");return 2;}
    int check=strcmp(argv[1],"check")==0;
    int footer=strcmp(argv[2],"footer")==0?1:
        (strcmp(argv[2],"qr")==0?2:(strcmp(argv[2],"bema")==0?3:0));
    FILE *file=fopen(argv[3],check?"rb":"wb");
    if(!file)return 3;
    cups_raster_t *r=cupsRasterOpen(fileno(file),check?CUPS_RASTER_READ:CUPS_RASTER_WRITE);
    if(!r){fclose(file);return 4;}
    cups_page_header2_t h;
    memset(&h,0,sizeof(h));
    if(!check){
        h.HWResolution[0]=h.HWResolution[1]=203;
        h.PageSize[0]=204;h.PageSize[1]=842;
        h.cupsPageSize[0]=204;h.cupsPageSize[1]=842;
        h.cupsWidth=576;h.cupsHeight=HEIGHT;
        h.cupsBitsPerPixel=1;h.cupsBitsPerColor=1;
        h.cupsColorSpace=CUPS_CSPACE_K;
        h.cupsColorOrder=CUPS_ORDER_CHUNKED;
        h.cupsBytesPerLine=ROW;
        strcpy(h.cupsPageSizeName,"Roll80mm");
        if(!cupsRasterWriteHeader2(r,&h))return 5;
    } else {
        if(!cupsRasterReadHeader2(r,&h))return 6;
        if(h.cupsWidth!=576 || h.cupsBytesPerLine!=ROW || h.HWResolution[0]!=203 ||
           h.HWResolution[1]!=203 || h.PageSize[0]!=204 ||
           h.cupsBitsPerPixel!=1 || h.cupsColorSpace!=CUPS_CSPACE_K)return 7;
        if(footer==1 && (h.cupsHeight<360 || h.cupsHeight>550))return 8;
        if(footer==2 && (h.cupsHeight<1841 || h.cupsHeight>=HEIGHT))return 9;
        if(footer==0 && (h.cupsHeight<360 || h.cupsHeight>550))return 10;
        if(footer==3 && (h.cupsHeight<440 || h.cupsHeight>650))return 13;
    }
    int code=draw(r,&h,footer,check);
    cupsRasterClose(r);
    fclose(file);
    if(code)return code;
    fprintf(stderr,"THERMAL_SMOKE_OK mode=%s variant=%s height=%u width=%u DPI=%u\n",
        argv[1],argv[2],h.cupsHeight,h.cupsWidth,h.HWResolution[1]);
    return 0;
}
