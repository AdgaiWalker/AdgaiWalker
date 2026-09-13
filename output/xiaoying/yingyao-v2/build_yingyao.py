import bpy, math, os, json, bmesh
from math import sin, cos, pi, exp, sqrt
from mathutils import Vector
OUT='/Users/happy/Desktop/AdgaiWalker/output/xiaoying/yingyao-v2'
assert bpy.context.mode=='OBJECT'
bpy.ops.scene.new(type='NEW')
scene=bpy.context.scene;scene.name='Xiaoying_Yingyao_V2'
scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=.1
scene.render.fps=24
def col(name):
    c=bpy.data.collections.new(name);scene.collection.children.link(c);return c
geo=col('V2_01_ShadowGlider');fc=col('V2_02_Expression');rc=col('V2_03_Rig');st=col('V2_04_Studio');rf=col('V2_05_Reference')
def move(o,c):
    for old in list(o.users_collection):old.objects.unlink(o)
    c.objects.link(o)
def material(name,color,rough=.6,sheen=0,emission=0):
    m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*color,1)
    p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough
    p.inputs['Sheen Weight'].default_value=sheen;p.inputs['Specular IOR Level'].default_value=.27
    if emission:p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=emission
    return m,p
ink,p=material('V2_Graphite_Ink',(.025,.023,.021),.73,.14)
n=ink.node_tree.nodes.new('ShaderNodeTexNoise');n.inputs['Scale'].default_value=110;n.inputs['Detail'].default_value=2
b=ink.node_tree.nodes.new('ShaderNodeBump');b.inputs['Strength'].default_value=.19;b.inputs['Distance'].default_value=.012
ink.node_tree.links.new(n.outputs['Fac'],b.inputs['Height']);ink.node_tree.links.new(b.outputs['Normal'],p.inputs['Normal'])
under,_=material('V2_Soft_Underside',(.065,.058,.048),.8,.1)
eyemat,_=material('V2_Warm_Light_Eyes',(1,.66,.28),.34,0,2.5)
pupilmat,_=material('V2_Tiny_Pupil',(.006,.005,.004),.4)
mouthmat,_=material('V2_Smile',(.35,.27,.18),.65)
groundmat,_=material('V2_Ivory_Stage',(.75,.71,.64),.9)

def smooth(a):
    a=max(0,min(1,a));return a*a*(3-2*a)
def perimeter(a):
    return (2.08*cos(a),1.13*sin(a)+.18*max(0,sin(a))**8)
def params(x,y):
    a=math.atan2(y/1.13,x/2.08);px,py=perimeter(a)
    rr=min(1,sqrt((x/2.08)**2+(y/(1.13+.18*max(0,sin(a))**7))**2))
    return rr,a
def heights(x,y,r=None,a=None):
    if r is None:r,a=params(x,y)
    f=smooth((abs(x)-.73)/1.35)
    curl=(.64 if x<0 else .14)*f*f
    edge=.115+.030*r*r+.025*cos(3*a)*r**6+curl
    dome=.94*max(0,1-r*r)**.62*exp(-(x/1.10)**2-(y/.98)**2*.14)
    thick=.09*sqrt(max(0,1-r*r))
    return edge+dome+thick,edge-thick
def mesh(name,verts,faces,c,mat,sub=1):
    me=bpy.data.meshes.new(name+'_Mesh');me.from_pydata(verts,[],faces);me.update()
    o=bpy.data.objects.new(name,me);c.objects.link(o);me.materials.append(mat)
    for poly in me.polygons:poly.use_smooth=True
    if sub:
        m=o.modifiers.new('Soft_Surface','SUBSURF');m.levels=sub;m.render_levels=sub
    return o

# One watertight double-surface radial mesh; shared perimeter, no stitched wings.
N=128;R=40;verts=[];faces=[];top_rings=[];bot_rings=[]
verts.append((0,0,heights(0,0,0,0)[0]));top_center=0
for i in range(1,R+1):
    ids=[];r=i/R
    for j in range(N):
        a=2*pi*j/N;px,py=perimeter(a);x=px*r;y=py*r
        ids.append(len(verts));verts.append((x,y,heights(x,y,r,a)[0]))
    top_rings.append(ids)
for j in range(N):faces.append((top_center,top_rings[0][j],top_rings[0][(j+1)%N]))
for i in range(R-1):
    for j in range(N):k=(j+1)%N;faces.append((top_rings[i][j],top_rings[i+1][j],top_rings[i+1][k],top_rings[i][k]))
top_face_count=len(faces)
bottom_center=len(verts);verts.append((0,0,heights(0,0,0,0)[1]))
for i in range(1,R):
    ids=[];r=i/R
    for j in range(N):
        a=2*pi*j/N;px,py=perimeter(a);x=px*r;y=py*r
        ids.append(len(verts));verts.append((x,y,heights(x,y,r,a)[1]))
    bot_rings.append(ids)
bot_rings.append(top_rings[-1])
for j in range(N):faces.append((bottom_center,bot_rings[0][(j+1)%N],bot_rings[0][j]))
for i in range(R-1):
    for j in range(N):k=(j+1)%N;faces.append((bot_rings[i][k],bot_rings[i+1][k],bot_rings[i+1][j],bot_rings[i][j]))
body=mesh('YY_Continuous_Body',verts,faces,geo,ink,1);body.data.materials.append(under)
for p in body.data.polygons:
    if p.index>=top_face_count:p.material_index=1
bm=bmesh.new();bm.from_mesh(body.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(body.data);bm.free()

face_objects=[];eye_objects=[]
def patch(name,cx,cy,rx,ry,mat,depth,blink=False):
    v=[(cx,cy,heights(cx,cy)[0]+depth)];f=[];sides=40;rings=10
    for i in range(1,rings+1):
        r=i/rings
        for j in range(sides):
            a=2*pi*j/sides;x=cx+rx*r*cos(a);y=cy+ry*r*sin(a)*abs(sin(a))**.35
            v.append((x,y,heights(x,y)[0]+depth+.004*(1-r*r)))
    for j in range(sides):f.append((0,1+j,1+(j+1)%sides))
    for i in range(rings-1):
        for j in range(sides):k=(j+1)%sides;a=1+i*sides;f.append((a+j,a+sides+j,a+sides+k,a+k))
    o=mesh(name,v,f,fc,mat,1);face_objects.append(o)
    if blink:eye_objects.append((o,cy,depth))
    return o
for side,x in [('R',-.31),('L',.31)]:
    patch('YY_LightEye.'+side,x,-.925,.14,.080,eyemat,.018,True)
    patch('YY_Pupil.'+side,x+.042,-.931,.037,.066,pupilmat,.029,True)
# Small smile follows the same top surface.
cu=bpy.data.curves.new('YY_Smile_Curve','CURVE');cu.dimensions='3D';cu.bevel_depth=.009;cu.bevel_resolution=4;cu.resolution_u=20
sp=cu.splines.new('BEZIER');sp.bezier_points.add(4)
for bp,(x,y) in zip(sp.bezier_points,[(-.095,-1.025),(-.05,-1.06),(0,-1.069),(.05,-1.06),(.095,-1.025)]):
    bp.co=(x,y,heights(x,y)[0]+.016);bp.handle_left_type='AUTO';bp.handle_right_type='AUTO'
mouth=bpy.data.objects.new('YY_Smile',cu);fc.objects.link(mouth);cu.materials.append(mouthmat)
bpy.context.view_layer.objects.active=mouth;mouth.select_set(True);bpy.ops.object.convert(target='MESH');mouth=bpy.context.object;mouth.select_set(False);face_objects.append(mouth)

# A compact rig supports position/orientation and independently editable wings.
ad=bpy.data.armatures.new('YY_Skeleton');rig=bpy.data.objects.new('YY_RIG',ad);rc.objects.link(rig)
bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
def bone(name,h,t,parent=None):
    b=ad.edit_bones.new(name);b.head=h;b.tail=t
    if parent:b.parent=ad.edit_bones[parent]
bone('Root',(0,0,0),(0,0,.3));bone('Body',(0,0,.2),(0,0,.8),'Root')
for side,s in [('R',-1),('L',1)]:
    bone('WingInner.'+side,(s*.60,0,.2),(s*1.30,0,.3),'Body')
    bone('WingOuter.'+side,(s*1.30,0,.3),(s*2.02,0,.45),'WingInner.'+side)
bone('Wake',(0,.60,.2),(0,1.28,.18),'Body')
bpy.ops.object.mode_set(mode='OBJECT');rig.show_in_front=True;ad.display_type='BBONE'
for pb in rig.pose.bones:pb.rotation_mode='XYZ'
for name in ['Body','WingInner.R','WingOuter.R','WingInner.L','WingOuter.L','Wake']:body.vertex_groups.new(name=name)
for v in body.data.vertices:
    x,y,z=v.co;wing=smooth((abs(x)-.55)/1.30);outer=smooth((abs(x)-1.15)/.8);wake=smooth((y-.66)/.62)*(1-wing)*.35
    side='L' if x>=0 else 'R'
    weights={'Body':max(0,1-wing-wake),'WingInner.'+side:wing*(1-outer),'WingOuter.'+side:wing*outer,'Wake':wake}
    for name,w in weights.items():
        if w>0:body.vertex_groups[name].add([v.index],w,'REPLACE')
for o in [body]+face_objects:
    if o!=body:
        vg=o.vertex_groups.new(name='Body');vg.add(list(range(len(o.data.vertices))),1,'REPLACE')
    mod=o.modifiers.new('YY_Deform','ARMATURE');mod.object=rig;mod.use_deform_preserve_volume=True;o.parent=rig

# Shape controls shared by skin and facial surfaces to maintain attachment.
def deform(p,name):
    x,y,z=p;v=Vector(p);f=smooth((abs(x)-.58)/1.5)
    if name=='Cradle':
        v.x=x*(1-.23*f);v.z+=1.05*f*f
        v.z-=.32*exp(-(x/.78)**2-(y/.75)**2)*smooth((z-.14)/.65)
    elif name=='Spread':v.x*=1+.12*f;v.z-=.06*f
    elif name=='PeekR' and x<0:v.z+=.34*f*f;v.x+=.10*f*f
    elif name=='PeekL' and x>0:v.z+=.34*f*f;v.x-=.10*f*f
    elif name=='Breathe':v.z+=.035*exp(-(x/1.05)**2-(y/.95)**2)*smooth((z-.12)/.7)
    return v
controls=['Cradle','Spread','PeekR','PeekL','Breathe']
for control in controls:
    rig[control]=0.0;rig.id_properties_ui(control).update(min=0,max=1,description=control+' deformation')
for o in [body]+face_objects:
    o.shape_key_add(name='Basis')
    for control in controls:
        key=o.shape_key_add(name=control,from_mix=False)
        for a,v in zip(o.data.shape_keys.key_blocks['Basis'].data,key.data):v.co=deform(a.co,control)
        driver=key.driver_add('value').driver;var=driver.variables.new();var.name='v';var.type='SINGLE_PROP';var.targets[0].id=rig;var.targets[0].data_path='["'+control+'"]';driver.expression='v'
rig['Blink']=0.0;rig.id_properties_ui('Blink').update(min=0,max=1)
for o,cy,depth in eye_objects:
    key=o.shape_key_add(name='Blink')
    for v in key.data:v.co.y=cy+(v.co.y-cy)*.015;v.co.z=heights(v.co.x,v.co.y)[0]+depth
    drv=key.driver_add('value').driver;var=drv.variables.new();var.name='v';var.type='SINGLE_PROP';var.targets[0].id=rig;var.targets[0].data_path='["Blink"]';drv.expression='v'
rig['Identity']='小影 / 影鳐 — low continuous living shadow'
rig['HumanAgency']='Offer options; wait for the person to decide.'

def aim(o,p):o.rotation_euler=(Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()
def camera(name,loc,target,scale):
    d=bpy.data.cameras.new(name);o=bpy.data.objects.new(name,d);st.objects.link(o);o.location=loc;aim(o,target);d.type='ORTHO';d.ortho_scale=scale;return o
hero=camera('YY_CAM_Hero',(4,-7.5,3.7),(0,0,.50),5.55)
camera('YY_CAM_Front',(0,-12,.48),(0,0,.48),5.2)
camera('YY_CAM_Left',(12,0,.5),(0,0,.5),4)
camera('YY_CAM_Right',(-12,0,.5),(0,0,.5),4)
camera('YY_CAM_Back',(0,12,.5),(0,0,.5),5.2)
camera('YY_CAM_Top',(0,0,12),(0,0,0),5.2)
scene.camera=hero
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.015));o=bpy.context.object;o.name='YY_STUDIO_Floor';move(o,st);o.data.materials.append(groundmat)
def light(name,loc,energy,size,color):
    d=bpy.data.lights.new(name,'AREA');o=bpy.data.objects.new(name,d);st.objects.link(o);o.location=loc;aim(o,(0,0,.4));d.energy=energy;d.shape='DISK';d.size=size;d.color=color
light('YY_Key',(-3,-4,6),900,5,(1,.88,.73));light('YY_Fill',(4,-2,4),550,4,(.82,.89,1));light('YY_Rim',(0,4,5),1000,3,(1,.92,.78))
w=bpy.data.worlds.new('YY_World');w.use_nodes=True;scene.world=w;bg=next(n for n in w.node_tree.nodes if n.type=='BACKGROUND');bg.inputs['Color'].default_value=(.35,.36,.40,1);bg.inputs['Strength'].default_value=.4
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True
scene.render.resolution_x=1400;scene.render.resolution_y=1000;scene.render.resolution_percentage=60
scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
im=bpy.data.images.load(OUT+'/yingyao-multiview.png',check_existing=True);im.pack()
ref=bpy.data.objects.new('YY_REFERENCE_Turnaround',None);rf.objects.link(ref);ref.empty_display_type='IMAGE';ref.data=im;ref.empty_display_size=5;ref.hide_render=True;rf.hide_viewport=True
for ar in bpy.context.screen.areas:
    if ar.type=='VIEW_3D':ar.spaces.active.region_3d.view_perspective='CAMERA';ar.spaces.active.overlay.show_overlays=False
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig
scene.frame_set(1);bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=OUT+'/xiaoying-yingyao-v2.blend')
scene.render.filepath=OUT+'/yingyao-preview.png'
def render():bpy.ops.render.render(write_still=True);return None
bpy.app.timers.register(render,first_interval=.3)
result={'scene':scene.name,'body_vertices':len(body.data.vertices),'bones':len(ad.bones),'file':bpy.data.filepath,'render_queued':scene.render.filepath}
