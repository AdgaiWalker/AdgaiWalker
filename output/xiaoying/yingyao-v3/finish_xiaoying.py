import bpy, math, random, json, os
from math import sin,cos,pi
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ns=bpy.app.driver_namespace['xy3_build']
root,body,scene=ns['root'],ns['body'],ns['scene']
OUT=ns['OUT']; props=ns['PROPS']; drive=ns['drive']; deform=ns['deform']
principled=ns['principled']; link=ns['link']; interact=ns['interact']
for p,(v,*_) in props.items():root[p]=v
root.update_tag();bpy.context.view_layer.update()

# Short tapered geometry fibers; no external texture or particle cache dependency.
deps=bpy.context.evaluated_depsgraph_get()
ev=body.evaluated_get(deps); em=ev.to_mesh(); em.calc_loop_triangles()
tris=list(em.loop_triangles)
weights=[t.area for t in tris]
random.seed(907)
fverts=[]; ffaces=[]; fbelly=[]
attr=em.attributes['XY_Belly'].data
for t in random.choices(tris,weights=weights,k=18000):
    a,b,c=[em.vertices[i] for i in t.vertices]
    r1=sqrt_r=math.sqrt(random.random());r2=random.random()
    wa,wb,wc=1-r1,r1*(1-r2),r1*r2
    p=a.co*wa+b.co*wb+c.co*wc
    if p.y<-.95 and abs(p.x)<.84 and .30<p.z<.88:continue
    normal=(a.normal*wa+b.normal*wb+c.normal*wc).normalized()
    if p.z<.13:continue
    tangent=(Vector((0,1,0))-normal*normal.y).normalized()
    bitangent=normal.cross(tangent).normalized()
    length=random.uniform(.010,.024)
    radius=random.uniform(.0009,.0015)
    base=len(fverts)
    blend=sum(attr[i].value*w for i,w in zip(t.vertices,(wa,wb,wc)))
    for level in (0,1):
        center=p+normal*(.0008+length*.55*level)+tangent*(length*.21*level)
        rr=radius*(1 if level==0 else .60)
        for j in range(3):
            fverts.append(center+rr*(tangent*cos(2*pi*j/3)+bitangent*sin(2*pi*j/3)))
            fbelly.append(blend)
    fverts.append(p+normal*length+tangent*(length*.55));fbelly.append(blend)
    for j in range(3):
        ffaces.append((base+j,base+(j+1)%3,base+3+(j+1)%3,base+3+j))
        ffaces.append((base+3+j,base+3+(j+1)%3,base+6))
ev.to_mesh_clear()
fm=bpy.data.meshes.new('XY3 / 亚毫米短绒纤维');fm.from_pydata(fverts,[],ffaces);fm.update()
fur=bpy.data.objects.new('XY3_FUR • 短绒细节',fm);body.users_collection[0].objects.link(fur);fur.parent=root
fur['xy_version']='3.0';fur['purpose']='Optional render detail; can hide for lighter viewport or realtime export'
for p in fm.polygons:p.use_smooth=True
fa=fm.attributes.new('XY_Belly','FLOAT','POINT')
for d,v in zip(fa.data,fbelly):d.value=v
mat,pr=principled('短绒纤维',(.013,.012,.011),.9)
pr.inputs['Sheen Weight'].default_value=.27;pr.inputs['Sheen Tint'].default_value=(.12,.105,.09,1)
at=mat.node_tree.nodes.new('ShaderNodeAttribute');at.attribute_name='XY_Belly'
mix=mat.node_tree.nodes.new('ShaderNodeMixRGB');mix.inputs[1].default_value=(.014,.013,.012,1);mix.inputs[2].default_value=(.19,.16,.125,1)
mat.node_tree.links.new(at.outputs['Fac'],mix.inputs[0]);mat.node_tree.links.new(mix.outputs[0],pr.inputs['Base Color'])
fm.materials.append(mat)
fur.shape_key_add(name='Basis')
for name in ['Breath','Wing_L','Wing_R','Receive','Rest','Tail_Sway','Squash']:
    k=fur.shape_key_add(name=name);k.slider_min=props[name][1]
    for dst,src in zip(k.data,fm.vertices):dst.co=deform(src.co,name)
    drive(k,'value',name)

# Symbolic payload uses the same material family and a bottom pivot.
root['Receive']=1;root['Wing_L']=.2;root['Wing_R']=.2
root.update_tag();bpy.context.view_layer.update()
deps=bpy.context.evaluated_depsgraph_get();surface=BVHTree.FromObject(body,deps)
payload_specs=[('A • 奶油方块',(-.46,.03),(.49,.47,.59),(.63,.51,.39),'BOX'),('B • 雾灰圆柱',(.05,.37),(.42,.42,.85),(.36,.34,.305),'CYLINDER'),('C • 陶土方块',(.52,.04),(.44,.43,.46),(.50,.29,.205),'BOX')]
cargo=[]
for name,(x,y),dims,color,kind in payload_specs:
    hit=surface.ray_cast(Vector((x,y,5)),Vector((0,0,-1)))
    base_z=hit[0].z+.012
    if kind=='BOX':bpy.ops.mesh.primitive_cube_add(size=1,location=(x,y,base_z+dims[2]/2))
    else:bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=.5,depth=1,location=(x,y,base_z+dims[2]/2))
    ob=link(bpy.context.object,interact);ob.name='XY3_CARGO / '+name;ob.dimensions=dims
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    for v in ob.data.vertices:v.co.z+=dims[2]/2
    ob.location.z=base_z;ob.parent=root
    bevel=ob.modifiers.new('产品倒角 / 1 mm','BEVEL');bevel.width=.018;bevel.segments=4
    bevel.limit_method='ANGLE';ob.modifiers.new('加权面法线','WEIGHTED_NORMAL')
    ma,mp=principled(name,color,.68);ob.data.materials.append(ma)
    for axis in range(3):drive(ob,'scale','Cargo',index=axis)
    cargo.append(ob)

# Warm abstract communication filaments and a resolved circle.
signal_mat,sp=principled('暖金连接光',(.95,.45,.10),.4)
sp.inputs['Emission Color'].default_value=(1,.43,.085,1);sp.inputs['Emission Strength'].default_value=3.3
def signal_obj(name,points,r=.009,closed=False):
    ob=ns['tube_mesh'](name,points,r,signal_mat,col=interact,closed=closed,animate=False)
    center=sum((v.co for v in ob.data.vertices),Vector())/len(ob.data.vertices)
    for v in ob.data.vertices:v.co-=center
    ob.location=center
    for axis in range(3):drive(ob,'scale','Signal',index=axis)
    return ob
for side in [-1,1]:
    pts=[]
    for i in range(65):
        t=i/64;x=side*(2.61+(1.1325126 if side>0 else 1.04)*t);y=-.28+.2*t;z=.47+.14*sin(pi*t)+(.0425126 if side>0 else -.04)*t
        pts.append((x,y,z))
    signal_obj('XY3_SIGNAL / '+('左连接' if side<0 else '右连接'),pts)
pts=[(3.99+.35*cos(2*pi*i/128),-.08,.76+.35*sin(2*pi*i/128)) for i in range(128)]
signal_obj('XY3_SIGNAL / 清晰的表达',pts,.010,True)
pts=[]
for i in range(241):
    t=2*pi*i/240
    pts.append((-3.93+.31*sin(3*t),-.05+.12*cos(5*t),.67+.28*sin(4*t+.3)))
signal_obj('XY3_SIGNAL / 被理解的思绪',pts,.007,True)

# Artist-authored states. Each Action keys the full common control contract.
base={k:v[0] for k,v in props.items()}
base.update({'Wing_L':.08,'Wing_R':.08})
def sample(f,**values):return (f,values)
STATES=[
 ('01_Idle','待机 · 安静陪伴',120,True,[sample(1,Breath=.1),sample(31,Breath=.65,Wing_L=.13),sample(61,Breath=.1,Wing_R=.13),sample(91,Breath=.55),sample(120,Breath=.1)],[(76,80,85)]),
 ('02_Hello','招呼 · 左翼挥手',90,False,[sample(1),sample(14,Squash=.18),sample(32,Wing_L=1.,Wing_R=.18,Breath=.3),sample(46,Wing_L=.69,Wing_R=.20),sample(59,Wing_L=.96,Wing_R=.16),sample(75,Wing_L=.43),sample(90)],[(61,64,69)]),
 ('03_Listen','倾听 · 侧身专注',120,True,[sample(1,Wing_L=.2,Wing_R=.10,Gaze_X=-.45),sample(31,Breath=.5,Wing_L=.30,Gaze_X=-.6,roll=-.035),sample(61,Breath=.1,Wing_L=.2,Gaze_X=-.5,roll=-.035),sample(91,Breath=.45,Wing_L=.3,Gaze_X=-.35),sample(120,Wing_L=.2,Wing_R=.10,Gaze_X=-.45)],[(79,83,88)]),
 ('04_Receive','承接 · 温柔托住',150,False,[sample(1),sample(24,Receive=.38,Wing_L=.1,Wing_R=.1),sample(48,Receive=1,Wing_L=.22,Wing_R=.22),sample(65,Receive=1,Wing_L=.22,Wing_R=.22,Cargo=1),sample(94,Receive=1,Wing_L=.24,Wing_R=.24,Cargo=1,Glow=1.1),sample(111,Receive=1,Wing_L=.22,Wing_R=.22,Cargo=0),sample(131,Receive=.45),sample(150)],[(83,87,92)]),
 ('05_Think','思考 · 轻摆回望',120,True,[sample(1,Gaze_X=.45),sample(28,Gaze_X=.65,Tail_Sway=.7,Wing_R=.28),sample(58,Gaze_X=-.4,Tail_Sway=-.5,Wing_L=.24,Breath=.35),sample(85,Gaze_X=-.6,Tail_Sway=-.75,Wing_L=.3),sample(120,Gaze_X=.45)],[(98,102,108)]),
 ('06_Express','表达 · 连接彼此',120,False,[sample(1),sample(22,Wing_L=.2,Wing_R=.2,Breath=.4),sample(43,Wing_L=.18,Wing_R=.18,Signal=1,Glow=1.25),sample(76,Wing_L=.18,Wing_R=.18,Signal=1,Glow=1.1),sample(98,Wing_L=.2,Wing_R=.2,Signal=0),sample(120)],[(84,88,93)]),
 ('07_Joy','开心 · 轻弹回应',90,False,[sample(1),sample(15,Squash=.65,Blink_L=.5,Blink_R=.5),sample(29,Wing_L=.73,Wing_R=.73,hop=.28,Glow=1.25),sample(42,Wing_L=.52,Wing_R=.52,hop=.12),sample(52,Squash=.4,Wing_L=.20,Wing_R=.2),sample(67,Wing_L=.4,Wing_R=.4,hop=.09),sample(90)],[(72,76,81)]),
 ('08_Sleep','休息 · 收光慢呼吸',180,True,[sample(1,Rest=1,Blink_L=1,Blink_R=1,Glow=.2,Breath=.1,Wing_L=0,Wing_R=0),sample(46,Rest=1,Blink_L=1,Blink_R=1,Glow=.25,Breath=.65,Wing_L=0,Wing_R=0),sample(91,Rest=1,Blink_L=1,Blink_R=1,Glow=.2,Breath=.1,Wing_L=0,Wing_R=0),sample(136,Rest=1,Blink_L=1,Blink_R=1,Glow=.25,Breath=.65,Wing_L=0,Wing_R=0),sample(180,Rest=1,Blink_L=1,Blink_R=1,Glow=.2,Breath=.1,Wing_L=0,Wing_R=0)],[]),
]
def curves(action):
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for fc in bag.fcurves:yield fc
root.animation_data_create()
root.animation_data.action=None
track=root.animation_data.nla_tracks.new();track.name='XY3 / 8 个状态 · 顺序预览'
manifest=[];cursor=1
for ident,label,length,loop,samples,blinks in STATES:
    action=bpy.data.actions.new('XY3 / '+ident+' / '+label);action.use_fake_user=True
    root.animation_data.action=action
    for frame,changes in samples:
        values=dict(base);values.update({k:v for k,v in changes.items() if k in props})
        for prop,value in values.items():
            root[prop]=value;root.keyframe_insert(data_path='["'+prop+'"]',frame=frame,group='表情与软体')
        root.location=(0,0,changes.get('hop',0))
        root.rotation_euler=(0,changes.get('roll',0),0)
        root.keyframe_insert(data_path='location',frame=frame,group='整体姿态')
        root.keyframe_insert(data_path='rotation_euler',frame=frame,group='整体姿态')
    for start,close,end in blinks:
        for prop in ['Blink_L','Blink_R']:
            for f,v in [(start,0),(close,1),(end,0)]:
                root[prop]=v;root.keyframe_insert(data_path='["'+prop+'"]',frame=f,group='表情与软体')
    for fc in curves(action):
        for k in fc.keyframe_points:k.interpolation='BEZIER';k.handle_left_type='AUTO_CLAMPED';k.handle_right_type='AUTO_CLAMPED'
    action['loop']=loop;action['fps']=30;action['description']=label
    action.asset_mark();action.asset_data.description=label+' / '+str(length/30)+' s / '+('循环' if loop else '单次回应')
    slot=root.animation_data.action_slot
    root.animation_data.action=None
    clip=track.strips.new(label,cursor,action)
    clip.action_slot=slot
    clip.extrapolation='NOTHING';clip.blend_type='REPLACE'
    clip.action_frame_start=1;clip.action_frame_end=length
    scene.timeline_markers.new(label,frame=cursor)
    manifest.append({'id':ident,'label':label,'start':cursor,'end':cursor+length-1,'duration_s':length/30,'loop':loop,'action':action.name})
    cursor+=length+15
root.animation_data.action=None
root.location=(0,0,0);root.rotation_euler=(0,0,0)
for p,v in base.items():root[p]=v
scene.frame_start=1;scene.frame_end=manifest[-1]['end']
scene['xy_states']=json.dumps(manifest,ensure_ascii=False)
scene['xy_controls']='Select XY3_CTRL • 小影总控 > Object Properties > Custom Properties. Eight Actions are marked as Assets.'
scene['xy_units']='1 Blender unit = 50 mm; neutral wingspan = 320 mm'
with open(OUT+'/states.json','w') as f:json.dump(manifest,f,ensure_ascii=False,indent=2)
hero=bpy.data.objects['XY3_CAM / 01 Hero'];hero.location=(3.3,-8.8,3.6)
hero.rotation_euler=(Vector((0,0,.7))-hero.location).to_track_quat('-Z','Y').to_euler()
data=bpy.data.cameras.new('XY3_CAM / 05 Interaction');data.type='ORTHO';data.ortho_scale=8.0
cam=bpy.data.objects.new(data.name,data);ns['studio'].objects.link(cam);cam.location=(3.0,-8.8,6.1);cam.rotation_euler=(Vector((0,0,.7))-cam.location).to_track_quat('-Z','Y').to_euler()
data=bpy.data.cameras.new('XY3_CAM / 06 Expression');data.type='ORTHO';data.ortho_scale=10.4
cam=bpy.data.objects.new(data.name,data);ns['studio'].objects.link(cam);cam.location=(2.5,-9.5,3.8);cam.rotation_euler=(Vector((0,0,.65))-cam.location).to_track_quat('-Z','Y').to_euler()
scene.camera=hero
scene.frame_set(manifest[1]['start']+31)
root.update_tag();bpy.context.view_layer.update()
ns.update({'fur':fur,'manifest':manifest,'cargo':cargo,'track':track})
result={'fur_strands':len(fverts)//7,'actions':manifest,'objects':len(scene.objects),'hero_frame':scene.frame_current}
