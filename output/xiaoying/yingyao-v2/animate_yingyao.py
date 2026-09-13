import bpy,math,json
from math import sin,cos,pi
OUT='/Users/happy/Desktop/AdgaiWalker/output/xiaoying/yingyao-v2'
scene=bpy.context.scene;rig=bpy.data.objects['YY_RIG'];rig.animation_data_create()
assert not rig.animation_data.nla_tracks
controls=['Cradle','Spread','PeekR','PeekL','Breathe','Blink']
states=[('Idle','待机',96,'轻微呼吸、翼缘慢摆、自然眨眼。',True),('Curious','好奇',96,'一侧翼缘翘起，身体小幅侧倾和探看。',True),('Listening','倾听',96,'身体轻轻前倾，慢点头，动作收敛。',True),('Offering','展开选项',120,'翼缘平稳展开，保持开放姿态，等待人作决定。',False),('Working','执行',96,'两翼卷成浅托盘，翼缘交替做小幅整理动作。',True),('Translating','转译',120,'身体舒展，波动从一侧传向另一侧，表现连接两种表达。',False),('Complete','完成反馈',72,'一次轻弹和舒展，随后恢复安静姿态。',False)]
manifest=[];start=1
for i,(name,cn,length,desc,loop) in enumerate(states):
    action=bpy.data.actions.new('YY_%02d_%s'%(i+1,name));action.use_fake_user=True;action['state']=cn;action['loopable']=loop
    rig.animation_data.action=action
    peak=round(1+.69*(length-1));frames=sorted(set(range(1,length+1,3))|{length,peak-3,peak,peak+3})
    for f in frames:
        t=(f-1)/(length-1);ph=2*pi*t;env=sin(pi*t)**2
        for pb in rig.pose.bones:pb.location=(0,0,0);pb.rotation_euler=(0,0,0);pb.scale=(1,1,1)
        for c in controls:rig[c]=0.0
        rig['Breathe']=.5-.5*cos(ph)
        rig['Blink']=float(max(0,1-abs(f-peak)/3))
        rig.pose.bones['Wake'].rotation_euler[2]=.025*sin(ph)*env
        hold=max(0,min(1,t/.22,(1-t)/.20));hold=hold*hold*(3-2*hold)
        if name=='Idle':
            rig['PeekL']=.10*env
        elif name=='Curious':
            rig['PeekR']=.72*env;rig['PeekL']=.12*env
            rig.pose.bones['Body'].rotation_euler[2]=.075*sin(ph)*env
            rig.pose.bones['Body'].rotation_euler[1]=.10*sin(ph)*env
        elif name=='Listening':
            rig.pose.bones['Body'].rotation_euler[0]=.025*env+.012*sin(2*ph)*env
            rig['PeekL']=.10*env;rig['Breathe']=.25*env
        elif name=='Offering':
            rig['Spread']=.92*hold;rig['Cradle']=.20*hold
            rig['Breathe']=.25*env
        elif name=='Working':
            rig['Cradle']=.72*hold
            rig['PeekR']=.16*(.5+.5*sin(3*ph))*env
            rig['PeekL']=.16*(.5-.5*sin(3*ph))*env
            rig.pose.bones['WingOuter.R'].rotation_euler[0]=.025*sin(3*ph)*env
            rig.pose.bones['WingOuter.L'].rotation_euler[0]=-.025*sin(3*ph)*env
        elif name=='Translating':
            rig['Spread']=.55*hold
            rig['PeekR']=.55*max(0,sin(ph))*env
            rig['PeekL']=.55*max(0,-sin(ph))*env
            rig.pose.bones['Body'].rotation_euler[1]=.06*sin(ph)*env
        elif name=='Complete':
            hop=sin(pi*max(0,min(1,(t-.10)/.45)))**2 if .1<t<.55 else 0
            rig.pose.bones['Root'].location[1]=.14*hop
            rig['Spread']=.35*env;rig['PeekL']=.35*env
        for c in controls:rig.keyframe_insert(data_path='["'+c+'"]',frame=f,group='Expressions')
        for pb in rig.pose.bones:
            for prop in ['location','rotation_euler','scale']:pb.keyframe_insert(data_path=prop,frame=f,group=pb.name)
    slot=rig.animation_data.action_slot;rig.animation_data.action=None
    tr=rig.animation_data.nla_tracks.new();tr.name='YY_'+cn;strip=tr.strips.new(name,start,action)
    if slot:strip.action_slot=slot
    strip.action_frame_start=1;strip.action_frame_end=length;strip.frame_start=start;strip.frame_end=start+length-1;strip.extrapolation='NOTHING';strip.blend_type='REPLACE'
    scene.timeline_markers.new(cn,frame=start)
    manifest.append({'state':cn,'action':action.name,'start':start,'end':start+length-1,'loopable':loop,'behavior':desc})
    start+=length
for c in controls:rig[c]=0.0
scene.frame_start=1;scene.frame_end=start-1;scene.frame_set(1)
with open(OUT+'/animation-states.json','w',encoding='utf-8') as f:json.dump(manifest,f,ensure_ascii=False,indent=2)
bpy.ops.wm.save_as_mainfile(filepath=OUT+'/xiaoying-yingyao-v2.blend')
result={'actions':7,'range':[1,scene.frame_end],'manifest':manifest}
