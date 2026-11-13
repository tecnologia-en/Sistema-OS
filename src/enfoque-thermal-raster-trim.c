/*
 * Enfoque Papelaria: trim empty receipt raster regions at original pixel scale.
 * CUPS Raster v2 original-scale trimmer for receipt devices, plus an
 * opt-in, bounded proportional fit for recognized Bematech 80-mm queues.
 * All other vendors continue using the original no-zoom processing.
 *
 * Fail closed on invalid raster pages. Unsupported color/bits are passed
 * unmodified. A guard discards tiny browser footer artifacts only if they
 * occur after >110mm continuous whitespace, near the bottom of a tall page.
 * Default processing does not crop sideways, move content or change resolution.
 * The separate opt-in Bematech fit rescales uniformly within 80-mm printable
 * raster width and retains resolution, orientation, native driver and paper size.
 */
#define _POSIX_C_SOURCE 200809L
#include <cups/raster.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <unistd.h>
#include <limits.h>

#define MAX_BUFFER (64UL * 1024UL * 1024UL)
#define MAX_PAGES 200
#define CUT_PAD_PX 36U

static int row_blank(const unsigned char *row, unsigned int bytes, unsigned char empty) {
  for (unsigned int i=0;i<bytes;++i) if (row[i]!=empty) return 0;
  return 1;
}
static unsigned int points_to_px(unsigned int pts,unsigned int dpi) {
  if (!dpi) return 0;
  uint64_t val=((uint64_t)pts*dpi+71)/72;
  return val>UINT_MAX?UINT_MAX:(unsigned int)val;
}

/* All ink detection is limited to the explicitly recognized CUPS pixel formats.
   When a model uses an unfamiliar bit layout, the original raster is preserved. */
static int pixel_ink(const unsigned char *row,unsigned int x,
                     const cups_page_header2_t *h) {
  if (h->cupsBitsPerPixel==1) {
    unsigned char bit=(unsigned char)(1U<<(7-(x&7U)));
    int set=(row[x>>3]&bit)!=0;
    return h->cupsColorSpace==CUPS_CSPACE_K?set:!set;
  }
  if (h->cupsBitsPerPixel==8) {
    return h->cupsColorSpace==CUPS_CSPACE_K?row[x]!=0:row[x]!=255;
  }
  if (h->cupsBitsPerPixel==24 && h->cupsColorSpace==CUPS_CSPACE_RGB) {
    const unsigned char *p=row+(size_t)x*3U;
    return p[0]!=255 || p[1]!=255 || p[2]!=255;
  }
  return 0;
}

static void copy_pixel(unsigned char *dest,unsigned int dx,
                       const unsigned char *src,unsigned int sx,
                       const cups_page_header2_t *h) {
  if (h->cupsBitsPerPixel==1) {
    unsigned char a=(unsigned char)(1U<<(7-(sx&7U)));
    unsigned char b=(unsigned char)(1U<<(7-(dx&7U)));
    if (src[sx>>3]&a)dest[dx>>3]|=b;
    else dest[dx>>3]&=(unsigned char)~b;
  } else if (h->cupsBitsPerPixel==8) {
    dest[dx]=src[sx];
  } else if (h->cupsBitsPerPixel==24) {
    memcpy(dest+(size_t)dx*3U,src+(size_t)sx*3U,3);
  }
}

/* Return NULL if the document is already full-width, too large, or incompatible.
   No modifications to QR payloads or the printer's native raster driver; pixel
   resampling is only applied when an admin-approved Bematech PPD opts in. */
static unsigned char *bematech_fit(const unsigned char *buf,
                                 const cups_page_header2_t *h,
                                 unsigned int content_end,
                                 unsigned int *new_height,
                                 float *applied_scale) {
  const char *mode=getenv("ENFOQUE_BEMATECH_FIT");
  if (!mode || strcmp(mode,"1")!=0 || h->cupsWidth<400 || h->cupsWidth>900 ||
      h->cupsHeight<150 || h->cupsHeight>5000 ||
      h->HWResolution[0]<180 || h->HWResolution[0]>400 ||
      h->HWResolution[1]<180 || h->HWResolution[1]>400 ||
      h->cupsColorOrder!=CUPS_ORDER_CHUNKED ||
      !((h->cupsBitsPerPixel==1&&(h->cupsColorSpace==CUPS_CSPACE_K ||
                                    h->cupsColorSpace==CUPS_CSPACE_W)) ||
        (h->cupsBitsPerPixel==8&&(h->cupsColorSpace==CUPS_CSPACE_K ||
                                    h->cupsColorSpace==CUPS_CSPACE_W)) ||
        (h->cupsBitsPerPixel==24&&h->cupsColorSpace==CUPS_CSPACE_RGB)))
      return NULL;
  if ((size_t)h->cupsWidth*h->cupsBitsPerPixel >
      (size_t)h->cupsBytesPerLine*8U || content_end>=h->cupsHeight)
      return NULL;
  unsigned int minx=h->cupsWidth,miny=h->cupsHeight,maxx=0,maxy=0;
  int any=0;
  for (unsigned int y=0;y<=content_end;y++) {
    const unsigned char *row=buf+(size_t)y*h->cupsBytesPerLine;
    for (unsigned int x=0;x<h->cupsWidth;x++) {
      if (!pixel_ink(row,x,h))continue;
      if (x<minx)minx=x;
      if (x>maxx)maxx=x;
      if (y<miny)miny=y;
      if (y>maxy)maxy=y;
      any=1;
    }
  }
  if (!any)return NULL;
  unsigned int ink_width=maxx-minx+1,ink_height=maxy-miny+1;
  if (ink_width<h->cupsWidth*0.38f || ink_width>h->cupsWidth*0.85f ||
      ink_height<65U || minx<12U || h->cupsWidth-maxx<12U)
    return NULL;
  unsigned int side=points_to_px(5U,h->HWResolution[0]);
  unsigned int top=points_to_px(5U,h->HWResolution[1]);
  unsigned int bottom=points_to_px(10U,h->HWResolution[1]);
  if (!side || !top || 2U*side+1U>=h->cupsWidth)return NULL;
  float scale=(float)(h->cupsWidth-2U*side)/(float)ink_width;
  if (scale>1.40f)scale=1.40f;
  if (scale<1.07f)return NULL;
  unsigned int out_h=(unsigned int)((float)ink_height*scale+0.999f)+top+bottom;
  if (out_h>h->cupsHeight || !out_h || (size_t)out_h>MAX_BUFFER/h->cupsBytesPerLine)
    return NULL;
  unsigned char empty=h->cupsColorSpace==CUPS_CSPACE_K?0:255;
  size_t bytes=(size_t)out_h*h->cupsBytesPerLine;
  unsigned char *scaled=malloc(bytes);
  if (!scaled)return NULL;
  memset(scaled,empty,bytes);
  /* The content keeps its original aspect ratio: both dimensions same scale. */
  unsigned int mapped_height=out_h-top-bottom;
  unsigned int mapped_width=(unsigned int)((float)ink_width*scale+0.999f);
  if (mapped_width>h->cupsWidth-2U*side)mapped_width=h->cupsWidth-2U*side;
  for (unsigned int y=0;y<mapped_height;y++) {
    unsigned int sy=miny+(unsigned int)((float)y/scale);
    if (sy>maxy)sy=maxy;
    const unsigned char *src=buf+(size_t)sy*h->cupsBytesPerLine;
    unsigned char *dst=scaled+(size_t)(y+top)*h->cupsBytesPerLine;
    for (unsigned int x=0;x<mapped_width;x++) {
      unsigned int sx=minx+(unsigned int)((float)x/scale);
      if (sx>maxx)sx=maxx;
      copy_pixel(dst,x+side,src,sx,h);
    }
  }
  *new_height=out_h;
  *applied_scale=scale;
  return scaled;
}

int main(int argc, char **argv) {
  (void)argc; (void)argv;
  cups_raster_t *r=cupsRasterOpen(STDIN_FILENO,CUPS_RASTER_READ);
  if (!r) { fprintf(stderr,"ERROR: enfoque receipt: input raster unavailable\n"); return 1; }
  cups_raster_t *w=cupsRasterOpen(STDOUT_FILENO,CUPS_RASTER_WRITE);
  if (!w) { cupsRasterClose(r); fprintf(stderr,"ERROR: enfoque receipt: output raster unavailable\n"); return 1; }
  cups_page_header2_t h;
  unsigned int pages=0;
  int okay=1;
  while (cupsRasterReadHeader2(r,&h)) {
    if (++pages>MAX_PAGES || !h.cupsBytesPerLine || !h.cupsHeight ||
       ((size_t)h.cupsHeight > SIZE_MAX/(size_t)h.cupsBytesPerLine)) {
      fprintf(stderr,"ERROR: enfoque receipt: invalid raster dimensions\n"); okay=0; break;
    }
    size_t bytes=(size_t)h.cupsHeight*h.cupsBytesPerLine;
    if (bytes>MAX_BUFFER) { fprintf(stderr,"ERROR: enfoque receipt: raster page exceeds safe 64MB cap\n"); okay=0; break; }
    unsigned char *buf=malloc(bytes);
    if (!buf) { fprintf(stderr,"ERROR: enfoque receipt: no buffer\n"); okay=0; break; }
    for (unsigned int y=0;y<h.cupsHeight;++y) {
      if (cupsRasterReadPixels(r,buf+(size_t)y*h.cupsBytesPerLine,h.cupsBytesPerLine)!=h.cupsBytesPerLine) {
        fprintf(stderr,"ERROR: enfoque receipt: truncated raster\n"); okay=0; break;
      }
    }
    if (!okay) { free(buf); break; }
    unsigned int from=0,to=h.cupsHeight;
    unsigned char white=0;
    const int color_supported =
      ((h.cupsColorSpace==CUPS_CSPACE_K && h.cupsBitsPerPixel==1 && (white=0,1)) ||
       (h.cupsColorSpace==CUPS_CSPACE_W && h.cupsBitsPerPixel==1 && (white=255,1)) ||
       (h.cupsColorSpace==CUPS_CSPACE_K && h.cupsBitsPerPixel==8 && (white=0,1)) ||
       (h.cupsColorSpace==CUPS_CSPACE_W && h.cupsBitsPerPixel==8 && (white=255,1)) ||
       (h.cupsColorSpace==CUPS_CSPACE_RGB && h.cupsBitsPerPixel==24 && (white=255,1)));
    const int trim=(color_supported && h.cupsColorOrder==CUPS_ORDER_CHUNKED &&
                    h.cupsHeight>96 && h.cupsWidth<=2000 && h.HWResolution[1]>0);
    int drop_footer=0;
    if (trim) {
      int first=-1,last=-1;
      for (unsigned int y=0;y<h.cupsHeight;y++) {
        if (!row_blank(buf+(size_t)y*h.cupsBytesPerLine,h.cupsBytesPerLine,white)) {
          if (first<0)first=(int)y;
          last=(int)y;
        }
      }
      if (first>=0 && last>=first) {
        int content_end=last;
        /*
         * Chrome can append a tiny print footer at the VERY END of a 297mm
         * page, with >110mm all-white gap below a short NFC-e receipt.
         * Never drop a QR code / actual content region: the isolated footer
         * must have <=18mm total height and appear in the last 22mm.
         */
        int gap_start=-1,gap_end=-1,open_gap=-1;
        for (int y=first;y<=last;y++) {
          int blank=row_blank(buf+(size_t)y*h.cupsBytesPerLine,h.cupsBytesPerLine,white);
          if (blank && open_gap<0)open_gap=y;
          else if (!blank && open_gap>=0) {
            if (y-open_gap>gap_end-gap_start){gap_start=open_gap;gap_end=y;}
            open_gap=-1;
          }
        }
        unsigned int large_gap=points_to_px(312U,h.HWResolution[1]); /* 110mm */
        unsigned int near_end=points_to_px(63U,h.HWResolution[1]);   /* 22mm */
        unsigned int short_tail=points_to_px(51U,h.HWResolution[1]); /* 18mm */
        if (gap_start>=first && gap_end>gap_start && (unsigned int)(gap_end-gap_start)>=large_gap &&
            (unsigned int)(last-gap_end)<=short_tail && h.cupsHeight-(unsigned int)last<=near_end &&
            (unsigned int)gap_start>=points_to_px(72U,h.HWResolution[1])) {
           content_end=gap_start-1;
           drop_footer=1;
        }
        /* Preserve top, left, width and native DPI exactly. No translation/zoom. */
        from=0;
        unsigned int cutpad=points_to_px(12U,h.HWResolution[1]); /* 4.2mm */
        if (cutpad<CUT_PAD_PX)cutpad=CUT_PAD_PX;
        uint64_t end=(uint64_t)content_end+1+cutpad;
        to=(unsigned int)(end>h.cupsHeight?h.cupsHeight:end);
        if (to<=from){from=0;to=h.cupsHeight;}
      } else {from=0;to=(h.cupsHeight>64?64:h.cupsHeight);}
    }
    unsigned char *fitted=NULL;
    float applied_scale=1.0f;
    unsigned int fitted_height=0;
    if (trim && to>from && to<=h.cupsHeight)
      fitted=bematech_fit(buf,&h,to-1,&fitted_height,&applied_scale);
    if (fitted) {
      from=0;
      to=fitted_height;
    }
    cups_page_header2_t out=h;
    out.cupsHeight=to-from;
    if (trim && out.cupsHeight!=h.cupsHeight) {
      float newPts=((float)out.cupsHeight*72.0f)/(float)h.HWResolution[1];
      out.PageSize[1]=(unsigned int)(newPts+0.5f);
      out.cupsPageSize[1]=newPts;
    }
    if (!cupsRasterWriteHeader2(w,&out)) {
      fprintf(stderr,"ERROR: enfoque receipt: cannot write header\n"); okay=0; free(fitted); free(buf); break;
    }
    unsigned char *render=fitted?fitted:buf;
    for (unsigned int y=from;y<to;y++) {
      if (cupsRasterWritePixels(w,render+(size_t)y*h.cupsBytesPerLine,h.cupsBytesPerLine)!=h.cupsBytesPerLine) {
        fprintf(stderr,"ERROR: enfoque receipt: cannot write pixel rows\n"); okay=0; break;
      }
    }
    if (trim) {
      fprintf(stderr,"INFO: enfoque receipt page=%u width_px=%u original_height_px=%u final_height_px=%u lead_skip_px=%u trimmed_white_px=%u browser_footer_removed=%d unchanged_scale=%d\n",
        pages,h.cupsWidth,h.cupsHeight,out.cupsHeight,from,h.cupsHeight-to,drop_footer,!fitted);
    } else fprintf(stderr,"INFO: enfoque receipt page=%u passthrough=1\n",pages);
    if (fitted)
      fprintf(stderr,"INFO: enfoque Bematech fit page=%u scale=%.3f new_height_px=%u\n",
              pages,(double)applied_scale,out.cupsHeight);
    free(fitted);
    free(buf);
    if (!okay)break;
  }
  cupsRasterClose(r);
  cupsRasterClose(w);
  return okay?0:1;
}
