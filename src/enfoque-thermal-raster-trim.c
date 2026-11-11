/*
 * Enfoque Papelaria: trim empty receipt raster regions at original pixel scale.
 * CUPS Raster v2 input/output for Elgin i9 only. No resampling or zoom.
 * The original thermal CUPS raster driver consumes the resulting stream unchanged.
 *
 * Fail closed on invalid raster pages. Unsupported color/bits are passed
 * unmodified. A guard discards tiny browser footer artifacts only if they
 * occur after >110mm continuous whitespace, near the bottom of a tall page.
 * Does not crop sideways or shift page content upward, nor change resolution.
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
    cups_page_header2_t out=h;
    out.cupsHeight=to-from;
    if (trim && out.cupsHeight!=h.cupsHeight) {
      float newPts=((float)out.cupsHeight*72.0f)/(float)h.HWResolution[1];
      out.PageSize[1]=(unsigned int)(newPts+0.5f);
      out.cupsPageSize[1]=newPts;
    }
    if (!cupsRasterWriteHeader2(w,&out)) {
      fprintf(stderr,"ERROR: enfoque receipt: cannot write header\n"); okay=0; free(buf); break;
    }
    for (unsigned int y=from;y<to;y++) {
      if (cupsRasterWritePixels(w,buf+(size_t)y*h.cupsBytesPerLine,h.cupsBytesPerLine)!=h.cupsBytesPerLine) {
        fprintf(stderr,"ERROR: enfoque receipt: cannot write pixel rows\n"); okay=0; break;
      }
    }
    if (trim) {
      fprintf(stderr,"INFO: enfoque receipt page=%u width_px=%u original_height_px=%u final_height_px=%u lead_skip_px=%u trimmed_white_px=%u browser_footer_removed=%d unchanged_scale=1\n",
        pages,h.cupsWidth,h.cupsHeight,out.cupsHeight,from,h.cupsHeight-to,drop_footer);
    } else fprintf(stderr,"INFO: enfoque receipt page=%u passthrough=1\n",pages);
    free(buf);
    if (!okay)break;
  }
  cupsRasterClose(r);
  cupsRasterClose(w);
  return okay?0:1;
}
