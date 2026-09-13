"""Original, deterministic nonverbal character sound study. No sampled recordings."""
from pathlib import Path
import json
import subprocess
import wave
import numpy as np
from scipy import signal
from scipy.interpolate import PchipInterpolator
import imageio_ffmpeg

OUT=Path(__file__).resolve().parent
ROOT=OUT.parent
SR=48000
RNG=np.random.default_rng(310910)
FFMPEG=imageio_ffmpeg.get_ffmpeg_exe()

def norm(x):
    return x/(np.max(np.abs(x))+1e-12)

def filtered_noise(n,lo,hi):
    sos=signal.butter(3,[lo,hi],btype='bandpass',fs=SR,output='sos')
    x=signal.sosfilt(sos,RNG.normal(size=n))
    return x/(np.sqrt(np.mean(x*x))+1e-12)

def smooth_random(n,spacing=.04):
    grid=np.arange(0,n+SR*spacing,SR*spacing)
    return PchipInterpolator(grid,RNG.normal(size=len(grid)))(np.arange(n))

def envelope(n,attack=.04,release=.08):
    t=np.arange(n)/SR
    e=np.ones(n)
    e*=np.sin(np.minimum(t/attack,1)*np.pi/2)**2
    e*=np.sin(np.minimum((n/SR-t)/release,1)*np.pi/2)**2
    return e

def voice(duration,pitches,opening=.4):
    n=round(duration*SR);t=np.arange(n)/SR;u=t/duration
    f0=PchipInterpolator([0,.35,.75,1],pitches)(u)
    # Irregular breath and a small pitch drift keep the voice from becoming a beep.
    f0*=1+.0035*np.sin(2*np.pi*5.1*t)+.0025*smooth_random(n,.045)
    phase=2*np.pi*np.cumsum(f0)/SR
    f1=350+100*opening+35*np.sin(np.pi*u)
    f2=790+130*opening-70*u
    x=np.zeros(n)
    for h in range(1,18):
        hz=h*f0
        formant=.22+1.6*np.exp(-.5*((hz-f1)/180)**2)+.7*np.exp(-.5*((hz-f2)/240)**2)
        weight=formant/(h**1.65)*np.exp(-(hz/3300)**2)
        x+=weight*np.sin(h*phase-.19*h*h)
    x=norm(x)
    breath=filtered_noise(n,270,2900)
    x=.92*x+.027*breath*(.65+.35*np.sin(np.pi*u))
    e=envelope(n,.035,.075)*(1-.25*u)*(1+.035*smooth_random(n,.036))
    return x*e

def cloth(duration,weight=1):
    n=round(duration*SR);t=np.arange(n)/SR;u=t/duration
    fiber=filtered_noise(n,450,2800)
    soft=filtered_noise(n,95,690)
    motion=np.clip(.55+.18*smooth_random(n,.025),.1,1)
    # Soft irregular granulation, no click or rhythmic static.
    x=(.055*fiber+.029*soft)*motion*np.sin(np.pi*u)**1.45
    return x*envelope(n,.065,.12)*weight

def cushion(duration,weight=1):
    n=round(duration*SR);t=np.arange(n)/SR
    hz=77+48*np.exp(-t/.04)
    phase=2*np.pi*np.cumsum(hz)/SR
    e=(1-np.exp(-t/.016))*np.exp(-t/.065)*envelope(n,.006,.065)
    x=(.38*np.sin(phase)+.22*filtered_noise(n,90,780))*e
    return x*weight

def light(duration):
    n=round(duration*SR);t=np.arange(n)/SR
    x=np.sin(2*np.pi*660*t)+.25*np.sin(2*np.pi*1002*t)
    return x*envelope(n,.05,.14)*np.exp(-t/.11)*.012

def spatial(mono,pan=0,room=.06):
    a=(pan+1)*np.pi/4
    stereo=np.column_stack((mono*np.cos(a),mono*np.sin(a)))
    for delay,gain,channel in [(.027,room,0),(.041,room*.7,1),(.064,room*.34,0)]:
        d=round(SR*delay)
        if len(mono)>d:stereo[d:,channel]+=mono[:-d]*gain
    return stereo

events=[]
mixes={}
stems={}
specs=[('hello','招呼',136,3.),('receive','承接',376,5.),('joy','开心',811,3.)]

def add(name,kind,frame,sound,label,pan=0):
    start=next(s[2] for s in specs if s[0]==name)
    local=(frame-start)/30
    offset=round(local*SR)
    audio=spatial(sound,pan,.045 if kind=='voice' else .025)
    length=min(len(audio),len(mixes[name])-offset)
    mixes[name][offset:offset+length]+=audio[:length]
    stems[name][kind][offset:offset+length]+=audio[:length]
    events.append({'state':name,'layer':kind,'frame':frame,'relative_s':round(local,6),
                   'duration_s':round(length/SR,6),'description':label})

for name,label,start,dur in specs:
    mixes[name]=np.zeros((round(dur*SR),2))
    stems[name]={k:np.zeros_like(mixes[name]) for k in ['voice','body','light']}

add('hello','body',150,cloth(.52),'左翼抬起，轻绒摩擦',-.22)
add('hello','voice',160,voice(.25,[232,224,239,248],.18)*.29,'第一音：轻柔试探')
add('hello','voice',170,voice(.34,[255,267,289,300],.38)*.31,'第二音：上扬回应')
add('hello','body',184,cloth(.43,.6),'第二次挥翼，弱摩擦',-.17)
add('hello','body',207,cloth(.31,.28),'收翼尾声',-.12)

add('receive','body',392,cloth(1.04,.62),'背部展开成浅盘')
add('receive','body',439,cushion(.27,.36),'道具显现时柔软承托，无硬碰撞')
add('receive','voice',445,voice(.26,[258,252,241,237],.35)*.255,'第一音：温和确认')
add('receive','voice',455,voice(.36,[237,227,208,200],.13)*.25,'第二音：满足地下落')
add('receive','light',469,light(.28),'眼光峰值的轻暖余音')
add('receive','body',490,cloth(.72,.43),'背部恢复，轻绒收拢')

add('joy','body',818,cloth(.32,.64)+cushion(.32,.18),'压身蓄力')
add('joy','voice',832,voice(.17,[236,244,260,274],.4)*.285,'第一音：快速轻呼')
add('joy','voice',839,voice(.25,[279,298,322,331],.5)*.33,'第二音：跃起时明亮上扬')
add('joy','body',862,cushion(.30,.9),'主落地，柔软的噗')
add('joy','body',869,cloth(.27,.42),'第二次轻弹')
add('joy','body',894,cloth(.20,.30),'落稳的轻绒尾声')

# One shared gain keeps the three personalities in the same acoustic family.
gain=.37/max(np.max(np.abs(x)) for x in mixes.values())
(OUT/'stems').mkdir(parents=True,exist_ok=True)
report=[]
def write_wav(path,audio):
    quantized=np.round(np.clip(audio,-1,1)*32767).astype('<i2')
    with wave.open(str(path),'wb') as f:
        f.setnchannels(2);f.setsampwidth(2);f.setframerate(SR);f.writeframes(quantized.tobytes())

for name,label,start,dur in specs:
    x=mixes[name]*gain
    write_wav(OUT/(name+'.wav'),x)
    for layer,stem in stems[name].items():
        write_wav(OUT/'stems'/(name+'-'+layer+'.wav'),stem*gain)
    rms=np.sqrt(np.mean(x*x))
    active=np.max(np.abs(x),axis=1)>.002
    true_peak=float(np.max(np.abs(signal.resample_poly(x,4,1,axis=0))))
    report.append({'state':name,'label':label,'duration_s':dur,'frame_start':start,
        'sample_rate':SR,'channels':2,'peak_dbfs':round(float(20*np.log10(np.max(np.abs(x)))),2),
        'rms_dbfs':round(float(20*np.log10(rms)),2),'active_rms_dbfs':round(float(20*np.log10(np.sqrt(np.mean(x[active]**2)))),2),
        'true_peak_dbfs':round(float(20*np.log10(true_peak)),2),
        'dc_offset':float(x.mean()),'clipped_samples':int(np.sum(np.abs(x)>=1))})

write_wav(OUT/'sound-preview.wav',np.concatenate([mixes[s[0]]*gain for s in specs]))
timeline=np.zeros((SR*37,2))
for name,label,start,dur in specs:
    offset=round((start-1)/30*SR)
    timeline[offset:offset+len(mixes[name])]+=mixes[name]*gain
write_wav(OUT/'timeline.wav',timeline)
(OUT/'cue-sheet.json').write_text(json.dumps({'version':'1.0 sound study','fps':30,'sample_rate':SR,
    'source':'Original procedural synthesis; no sampled voice, recordings or licensed effects.',
    'states':report,'events':events},ensure_ascii=False,indent=2))
(OUT/'validation-audio.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))

def ff(args):
    subprocess.run([FFMPEG,'-hide_banner','-loglevel','error','-y',*args],check=True)

for name,label,start,dur in specs:
    ff(['-ss',str((start-1)/30),'-i',str(ROOT/'xiaoying-motion-preview.mp4'),
        '-i',str(OUT/(name+'.wav')),'-t',str(dur),'-map','0:v:0','-map','1:a:0',
        '-vf','fps=30:start_time=0,tpad=stop_mode=clone:stop_duration=0.1','-frames:v',str(round(dur*30)),
        '-c:v','libx264','-crf','18','-preset','fast','-pix_fmt','yuv420p','-r','30',
        '-c:a','aac','-b:a','192k','-ar',str(SR),'-movflags','+faststart',str(OUT/(name+'.mp4'))])
ff(['-i',str(OUT/'hello.mp4'),'-i',str(OUT/'receive.mp4'),'-i',str(OUT/'joy.mp4'),
    '-i',str(OUT/'sound-preview.wav'),'-filter_complex',
    '[0:v]setpts=PTS-STARTPTS[v0];[1:v]setpts=PTS-STARTPTS[v1];[2:v]setpts=PTS-STARTPTS[v2];[v0][v1][v2]concat=n=3:v=1:a=0[v]',
    '-map','[v]','-map','3:a:0','-c:v','libx264','-crf','18','-preset','fast','-r','30',
    '-c:a','aac','-b:a','192k','-t','11','-movflags','+faststart',str(OUT/'sound-preview.mp4')])
ff(['-i',str(ROOT/'xiaoying-motion-preview.mp4'),'-i',str(OUT/'timeline.wav'),'-map','0:v:0','-map','1:a:0',
    '-c:v','copy','-c:a','aac','-b:a','192k','-t','36.534','-movflags','+faststart',str(OUT/'full-motion-with-sound.mp4')])
print(json.dumps({'out':str(OUT),'gain':gain,'audio':report,'video':'sound-preview.mp4'},ensure_ascii=False,indent=2))
