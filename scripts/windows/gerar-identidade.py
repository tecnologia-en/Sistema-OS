#!/usr/bin/env python3
"""Gera artes originais do Enfoque OS (sem baixar logos, sem fontes no repo).
Requer Python 3 e Pillow no Windows; executado antes de versionar as imagens.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
BLUE = (27, 129, 213)
WHITE = (240, 248, 255)

def font(size, bold=True):
    paths = [
        "C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ]
    for p in paths:
        if Path(p).is_file():
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

def background(width, height):
    im = Image.new("RGB", (width, height))
    px = im.load()
    for y in range(height):
        t = y / max(1, height-1)
        for x in range(width):
            h = x / max(1, width-1)
            px[x,y] = (int(8+4*h+3*t), int(18+10*h+8*t), int(34+25*h+12*t))
    return im.convert("RGBA")

def geometry(im):
    w,h = im.size
    fx = w / 1920
    fy = h / 1080
    v = Image.new("RGBA", im.size, (0,0,0,0))
    d = ImageDraw.Draw(v)
    poly = [
        (1030,-120),(1920,-120),(1920,1080),(1450,1080),
        (1140,720),(1270,410)
    ]
    d.polygon([(int(x*fx),int(y*fy)) for x,y in poly],fill=(14,91,166,40))
    for off in range(5):
        x = (1280 + off*138)*fx
        d.polygon([(int(x),0),(int(x+180*fx),0),
                   (int(x-210*fx),h),(int(x-390*fx),h)],
                  fill=(38,134,208,10+3*off))
    for i in range(15):
        x=int(i*128*fx)
        d.line([(x,0),(x,h)],fill=(130,179,218,7),width=1)
    im.alpha_composite(v)

def mark(im, x, y, size):
    d=ImageDraw.Draw(im)
    s=size/100
    d.rounded_rectangle((x,y,x+100*s,y+100*s),radius=20*s,fill=(*BLUE,255))
    d.rounded_rectangle((x+23*s,y+22*s,x+36*s,y+78*s),radius=3*s,fill=WHITE)
    for top,length in ((22,51),(45,40),(68,51)):
        d.rounded_rectangle((x+23*s,y+top*s,x+(23+length)*s,y+(top+12)*s),
                            radius=3*s,fill=WHITE)
    d.ellipse((x+80*s,y+78*s,x+90*s,y+88*s), fill=(91,207,255,255))

def desktop():
    im=background(1920,1080)
    geometry(im)
    d=ImageDraw.Draw(im)
    mark(im,200,345,138)
    d.text((378,349),"enfoque",font=font(105),fill=WHITE,stroke_width=0)
    d.text((804,370),"OS",font=font(81),fill=(79,183,251))
    d.line([(205,531),(1160,531)],fill=(61,147,218,190),width=2)
    d.text((207,553),"SISTEMA OPERACIONAL CORPORATIVO",font=font(29,False),fill=(181,208,231))
    d.text((205,1007),"ENFOQUE  /  PILOTO 0.1.8  /  AMBIENTE DE TESTES",font=font(21,False),fill=(123,163,195))
    dest=ROOT/"config/includes.chroot/usr/share/backgrounds/enfoque-os/wallpaper.png"
    dest.parent.mkdir(parents=True,exist_ok=True)
    im.convert("RGB").save(dest,optimize=True)
    return dest

def splash(w,h,path):
    im=background(w,h)
    geometry(im)
    d=ImageDraw.Draw(im)
    mark(im,int(w*.08),int(h*.08),int(h*.15))
    d.text((int(w*.08+h*.18),int(h*.085)),"enfoque OS",
           font=font(int(h*.088)),fill=WHITE)
    d.line([(int(w*.08),int(h*.28)),(int(w*.91),int(h*.28))],
           fill=(61,147,218,180),width=2)
    d.text((int(w*.09),int(h*.92)),"PILOTO 0.1.8  |  AMBIENTE DE TESTES",
           font=font(int(h*.027),False),fill=(158,194,224))
    path.parent.mkdir(parents=True,exist_ok=True)
    im.convert("RGB").save(path,optimize=True)
    return path

def icon():
    im=Image.new("RGBA",(256,256),(0,0,0,0))
    mark(im,13,13,230)
    p=ROOT/"config/includes.chroot/usr/share/icons/hicolor/256x256/apps/enfoque-os.png"
    p.parent.mkdir(parents=True,exist_ok=True)
    im.save(p,optimize=True)
    return p

if __name__=="__main__":
    for p in (desktop(),
              splash(640,480,ROOT/"config/bootloaders/isolinux/splash.png"),
              splash(800,600,ROOT/"config/bootloaders/grub-pc/splash.png"),
              icon()):
        print(p, p.stat().st_size)
