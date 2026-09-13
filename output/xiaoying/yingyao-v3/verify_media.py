"""Check the delivered PNG and MP4 container metadata without external dependencies."""
import json
import struct
from pathlib import Path

OUT=Path(__file__).resolve().parent
movie=OUT/'xiaoying-motion-preview.mp4'
data=movie.read_bytes()
def atoms(start,end):
    pos=start
    while pos+8<=end:
        size,kind=struct.unpack_from('>I4s',data,pos)
        header=8
        if size==1:
            size=struct.unpack_from('>Q',data,pos+8)[0]
            header=16
        elif size==0:
            size=end-pos
        if size<header or pos+size>end:
            raise ValueError('Invalid or incomplete MP4 atom')
        yield kind,pos+header,pos+size
        pos+=size

duration=None
dimensions=None
frame_count=None
for kind,start,end in atoms(0,len(data)):
    if kind!=b'moov':continue
    for k,s,e in atoms(start,end):
        if k==b'mvhd':
            version=data[s]
            offset=s+(20 if version==1 else 12)
            timescale=struct.unpack_from('>I',data,offset)[0]
            length=struct.unpack_from('>Q' if version==1 else '>I',data,offset+4)[0]
            duration=length/timescale
        if k==b'trak':
            for tk,ts,te in atoms(s,e):
                if tk==b'tkhd':
                    dimensions=[v/65536 for v in struct.unpack_from('>II',data,te-8)]
                if tk==b'mdia':
                    for mk,ms,me in atoms(ts,te):
                        if mk!=b'minf':continue
                        for ik,ins,ine in atoms(ms,me):
                            if ik!=b'stbl':continue
                            for sk,ss,se in atoms(ins,ine):
                                if sk==b'stsz':frame_count=struct.unpack_from('>I',data,ss+8)[0]

expected=['01-hero.png','01-idle.png','02-hello.png','03-listen.png',
          '04-receive.png','05-think.png','06-express.png','07-joy.png',
          '08-sleep.png','09-material-detail.png','xiaoying-asset.blend',
          'xiaoying-yingyao-v3.blend','gallery.html','README.md']
stills=[]
for name in expected:
    p=OUT/name
    assert p.is_file() and p.stat().st_size>0,name
    if p.suffix=='.png':
        header=p.read_bytes()[:24]
        assert header[:8]==b'\x89PNG\r\n\x1a\n',name
        stills.append({'file':name,'dimensions':list(struct.unpack('>II',header[16:24]))})
assert duration is not None and abs(duration-36.534)<.01,duration
assert dimensions==[720,540],dimensions
assert frame_count==548,frame_count
report={'duration_s':duration,'dimensions':dimensions,'frame_count':frame_count,
        'bytes':len(data),'required_files_exist':True,'stills':stills}
(OUT/'validation-video.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps(report,ensure_ascii=False,indent=2))
