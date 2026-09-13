import bpy, math, json
from math import sin, cos, pi
OUT='/Users/happy/Desktop/AdgaiWalker/output/xiaoying/blender'
scene=bpy.context.scene
rig=bpy.data.objects['XY_RIG']
rig.animation_data_create()
assert not rig.animation_data.nla_tracks, 'Animation already installed.'

# All eye layers close onto one eyelid line, preserving layered alignment.
for ob in bpy.data.collections['02_FACE'].objects:
    if ob.type=='MESH' and ob.data.shape_keys:
        basis=ob.data.shape_keys.key_blocks['Basis']
        key=ob.data.shape_keys.key_blocks.get('Blink')
        if key:
            for a,b in zip(basis.data,key.data):
                b.co.z=2.085+(a.co.z-2.085)*.025
                x=b.co.x;z=b.co.z
                oldsurf=-.005-.67*math.sqrt(max(.04,1-(a.co.x/.88)**2-((a.co.z-2.04)/.77)**2))
                newsurf=-.005-.67*math.sqrt(max(.04,1-(x/.88)**2-((z-2.04)/.77)**2))
                b.co.y=a.co.y+(newsurf-oldsurf)

states=[
    ('01_Idle','待机',96,'呼吸、轻摆尾、自然眨眼；低干扰循环。'),
    ('02_Curious','好奇',96,'歪头探看，耳朵轻动，尾端跟随；不碰人的工作内容。'),
    ('03_Listening','倾听',96,'轻轻前倾、慢点头，动作收敛，留出回应空间。'),
    ('04_Offering','展开选项',120,'双爪打开、尾巴舒展，再安静等待人的选择。'),
    ('05_Working','执行',96,'双爪交替做小幅操作，尾巴有节奏地协助。'),
    ('06_Translating','转译',120,'视线与双爪从一侧转向另一侧，表现倾听与传达。'),
    ('07_Complete','完成反馈',72,'一次轻弹、抬爪回应，随后回到安静姿态。'),
]
manifest=[]
start=1
for name,cn,length,description in states:
    action=bpy.data.actions.new('XY_'+name)
    action.use_fake_user=True
    action['state']=cn;action['description']=description
    action['loopable']=name.startswith(('01','02','03','05'))
    rig.animation_data.action=action
    # Sample full transforms and the blink control. Every clip has neutral boundaries.
    blink_t = .80 if name.startswith('03') else .78 if name.startswith('04') else .45 if name.startswith('07') else .69
    blink_peak=round(1+blink_t*(length-1))
    frames=sorted(set(list(range(1,length+1,3))+[length,blink_peak-3,blink_peak,blink_peak+3]))
    for f in frames:
        t=(f-1)/(length-1); phase=2*pi*t; env=sin(pi*t)**2
        for pb in rig.pose.bones:
            pb.location=(0,0,0);pb.rotation_euler=(0,0,0);pb.scale=(1,1,1)
        body=rig.pose.bones['Body']; head=rig.pose.bones['Head']
        breath=.013*sin(phase)
        body.scale=(1-breath*.3,1+breath,1-breath*.3)
        head.rotation_euler[2]=.018*sin(phase)
        for j in range(6):
            rig.pose.bones['Tail.%02d'%j].rotation_euler[2]=.025*sin(phase-j*.32)*env
        rig.pose.bones['Ear.L'].rotation_euler[1]=.035*sin(phase)*env
        blink=max(0,1-abs(t-.69)/.04)
        if name.startswith('02'):
            head.rotation_euler[2]=.20*sin(phase)*env
            head.rotation_euler[1]=.18*sin(phase)*env
            body.rotation_euler[2]=.055*sin(phase)*env
            rig.pose.bones['Ear.R'].rotation_euler[0]=.13*sin(2*phase)*env
            for j in range(6):rig.pose.bones['Tail.%02d'%j].rotation_euler[0]=.065*sin(phase-j*.5)*env
        elif name.startswith('03'):
            head.rotation_euler[0]=.08*env+.035*sin(2*phase)*env
            head.rotation_euler[2]=-.06*env
            body.rotation_euler[0]=.035*env
            blink=max(0,1-abs(t-.80)/.05)
        elif name.startswith('04'):
            # Reach a stable open gesture then return; no selected winner.
            hold=min(1,t/.25,(1-t)/.20)
            hold=max(0,hold);hold=hold*hold*(3-2*hold)
            rig.pose.bones['Arm.R'].rotation_euler[2]=-.58*hold
            rig.pose.bones['Arm.L'].rotation_euler[2]=.58*hold
            head.rotation_euler[0]=-.035*hold
            for j in range(6):rig.pose.bones['Tail.%02d'%j].rotation_euler[0]=-.06*hold
            blink=max(0,1-abs(t-.78)/.035)
        elif name.startswith('05'):
            head.rotation_euler[0]=.09*env
            rig.pose.bones['Arm.R'].rotation_euler[0]=.24*sin(3*phase)*env
            rig.pose.bones['Arm.L'].rotation_euler[0]=-.24*sin(3*phase)*env
            for j in range(6):rig.pose.bones['Tail.%02d'%j].rotation_euler[0]=.042*sin(3*phase-j*.4)*env
        elif name.startswith('06'):
            head.rotation_euler[1]=.24*sin(phase)*env
            head.rotation_euler[2]=.045*sin(phase)*env
            rig.pose.bones['Arm.R'].rotation_euler[2]=-.38*env*max(0,sin(phase))
            rig.pose.bones['Arm.L'].rotation_euler[2]=.38*env*max(0,-sin(phase))
            for j in range(6):rig.pose.bones['Tail.%02d'%j].rotation_euler[2]=.06*sin(phase-j*.25)*env
        elif name.startswith('07'):
            hop=sin(pi*min(1,max(0,(t-.1)/.45)))**2 if .1<t<.55 else 0
            rig.pose.bones['Root'].location[1]=.13*hop
            rig.pose.bones['Arm.L'].rotation_euler[2]=.70*env
            rig.pose.bones['Arm.L'].rotation_euler[0]=.15*sin(3*phase)*env
            head.rotation_euler[2]=-.085*env
            blink=max(0,1-abs(t-.45)/.045)
        blink=float(max(0,1-abs(f-blink_peak)/3))
        rig['blink']=blink
        rig.keyframe_insert(data_path='["blink"]',frame=f,group='Face')
        for pb in rig.pose.bones:
            pb.keyframe_insert(data_path='location',frame=f,group=pb.name)
            pb.keyframe_insert(data_path='rotation_euler',frame=f,group=pb.name)
            pb.keyframe_insert(data_path='scale',frame=f,group=pb.name)
    slot=rig.animation_data.action_slot
    rig.animation_data.action=None
    track=rig.animation_data.nla_tracks.new();track.name='XY_'+cn
    strip=track.strips.new(name,start,action)
    if slot:strip.action_slot=slot
    strip.action_frame_start=1;strip.action_frame_end=length
    strip.frame_start=start;strip.frame_end=start+length-1
    strip.extrapolation='NOTHING';strip.blend_type='REPLACE'
    marker=scene.timeline_markers.new(cn,frame=start)
    manifest.append({'id':name,'name':cn,'start':start,'end':start+length-1,'duration_seconds':round((length-1)/24,3),'action':action.name,'behavior':description,'loopable':bool(action['loopable'])})
    start+=length
rig['blink']=0.0
scene.frame_start=1;scene.frame_end=start-1
scene.frame_set(1)
rig['state_guide']='See packed README_XIAOYING and timeline markers. NLA tracks sequence all seven clips.'
with open(OUT+'/animation-states.json','w',encoding='utf-8') as f:json.dump(manifest,f,ensure_ascii=False,indent=2)
bpy.ops.wm.save_as_mainfile(filepath=OUT+'/xiaoying-character-v1.blend')
result={'actions':len(manifest),'bones':len(rig.pose.bones),'timeline':[scene.frame_start,scene.frame_end],'states':manifest}
