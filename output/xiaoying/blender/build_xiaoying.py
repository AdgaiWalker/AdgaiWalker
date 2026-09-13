import bpy, math, json, os
from mathutils import Vector
from math import sin, cos, pi

OUT = '/Users/happy/Desktop/AdgaiWalker/output/xiaoying/blender'
scene = bpy.context.scene
assert len(scene.objects) == 0, 'Build requires the inspected empty scene.'
scene.name = 'Xiaoying_Studio'
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 0.1
scene.render.fps = 24

def collection(name):
    c = bpy.data.collections.new(name)
    scene.collection.children.link(c)
    return c
geo = collection('01_CHARACTER')
face = collection('02_FACE')
rigcol = collection('03_RIG')
stage = collection('04_STUDIO')
refs = collection('05_REFERENCE')

def move(obj, col):
    for c in list(obj.users_collection): c.objects.unlink(obj)
    col.objects.link(obj)

def mat(name, color, rough=.5, sheen=0, coat=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Sheen Weight'].default_value = sheen
    p.inputs['Coat Weight'].default_value = coat
    return m, p
ink, shader = mat('XY_Ink_Velvet', (.027,.025,.024), .67, .32)
noise = ink.node_tree.nodes.new('ShaderNodeTexNoise')
noise.inputs['Scale'].default_value = 145
noise.inputs['Detail'].default_value = 2
bump = ink.node_tree.nodes.new('ShaderNodeBump')
bump.inputs['Strength'].default_value = .13
bump.inputs['Distance'].default_value = .009
ink.node_tree.links.new(noise.outputs['Fac'], bump.inputs['Height'])
ink.node_tree.links.new(bump.outputs['Normal'], shader.inputs['Normal'])
inner, _ = mat('XY_Ear_Inner', (.052,.042,.040), .78, .18)
socket, _ = mat('XY_Eyelid', (.015,.013,.012), .6)
ivory, _ = mat('XY_Eye_Ivory', (.86,.77,.60), .28, 0, .18)
pupil, _ = mat('XY_Pupil_Obsidian', (.006,.005,.004), .16, 0, .36)
nosemat, _ = mat('XY_Nose', (.042,.029,.023), .35)
glint, gp = mat('XY_Catchlight', (1,.94,.82), .16)
gp.inputs['Emission Color'].default_value=(1,.94,.82,1)
gp.inputs['Emission Strength'].default_value=.25
floor_mat, _ = mat('Studio_Warm_Paper', (.69,.66,.59), .86)

bound = []
def mesh(name, verts, faces, material, col=geo, bone=None, sub=1):
    me=bpy.data.meshes.new(name+'_Mesh')
    me.from_pydata(verts, [], faces); me.update()
    ob=bpy.data.objects.new(name,me); col.objects.link(ob)
    ob.data.materials.append(material)
    for p in me.polygons: p.use_smooth=True
    if sub:
        mod=ob.modifiers.new('Surface_Subdivision','SUBSURF'); mod.levels=sub; mod.render_levels=sub
    if bone: bound.append((ob,bone))
    return ob

def ellipsoid(name, center, scale, material=ink, bone=None, col=geo, deform=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=32, location=(0,0,0))
    ob=bpy.context.object; ob.name=name; move(ob,col)
    for v in ob.data.vertices:
        p=v.co.copy()
        if deform: p=deform(p)
        v.co=Vector((p.x*scale[0]+center[0],p.y*scale[1]+center[1],p.z*scale[2]+center[2]))
    ob.data.materials.append(material)
    for p in ob.data.polygons:p.use_smooth=True
    if bone:bound.append((ob,bone))
    return ob

body=ellipsoid('XY_Body',(0,.05,.76),(.57,.45,.69),bone='Body',deform=lambda p:Vector((p.x*(1-.19*p.z),p.y*(1-.13*p.z),p.z)))
head=ellipsoid('XY_Head',(0,-.005,2.04),(.88,.67,.77),bone='Head')
for side,x in [('R',-.38),('L',.38)]:
    ellipsoid('XY_Foot.'+side,(x,-.13,.17),(.245,.33,.17),bone='Foot.'+side)
    arm=ellipsoid('XY_Paw.'+side,(x,-.375,1.03),(.19,.205,.32),bone='Arm.'+side)

def catmull(vals,t):
    n=len(vals); v=t*(n-1); i=min(int(v),n-2); u=v-i
    a=vals[max(i-1,0)]; b=vals[i]; c=vals[i+1]; d=vals[min(i+2,n-1)]
    return tuple(.5*(2*b[k]+(-a[k]+c[k])*u+(2*a[k]-5*b[k]+4*c[k]-d[k])*u*u+(-a[k]+3*b[k]-3*c[k]+d[k])*u*u*u) for k in range(len(b)))

def loft(name, sections, material=ink, bone=None, rings=40, sides=20):
    # Sections: x,y,z,width,depth; cross-sections perpendicular to a smooth centerline.
    verts=[]; faces=[]; ts=[]
    for i in range(rings+1):
        t=i/rings; q=catmull(sections,t)
        a=catmull(sections,max(0,t-.002)); b=catmull(sections,min(1,t+.002))
        tangent=Vector((b[0]-a[0],b[1]-a[1],b[2]-a[2])).normalized()
        depth=Vector((0,1,0))
        if abs(tangent.dot(depth))>.96:depth=Vector((0,0,1))
        width=depth.cross(tangent).normalized(); depth=tangent.cross(width).normalized()
        for j in range(sides):
            ang=2*pi*j/sides
            p=Vector(q[:3])+width*cos(ang)*max(.003,q[3])+depth*sin(ang)*max(.003,q[4])
            verts.append(tuple(p));ts.append(t)
    for i in range(rings):
        for j in range(sides):
            a=i*sides+j;b=i*sides+(j+1)%sides
            faces.append((a,b,b+sides,a+sides))
    faces.append(tuple(range(sides-1,-1,-1)))
    faces.append(tuple(rings*sides+j for j in range(sides)))
    return mesh(name,verts,faces,material,bone=bone,sub=2),ts

ear_r=[(-.53,.01,2.53,.285,.17),(-.63,.015,2.76,.25,.13),(-.71,.02,3.01,.14,.085),(-.68,.025,3.24,.008,.008)]
ear_l=[(.52,.01,2.55,.28,.16),(.65,.005,2.78,.225,.13),(.85,-.015,2.79,.17,.10),(1.00,-.075,2.60,.08,.06),(.965,-.12,2.48,.008,.008)]
er,_=loft('XY_Ear_Upright.R',ear_r,bone='Ear.R')
el,_=loft('XY_Ear_Folded.L',ear_l,bone='Ear.L')
# Recess-like inner patches sit just in front of the ears, with a soft dark rim.
loft('XY_Ear_Inner.R',[(-.54,-.15,2.61,.13,.012),(-.64,-.125,2.80,.14,.012),(-.70,-.07,3.04,.025,.008),(-.69,-.04,3.12,.003,.004)],inner,'Ear.R',24,16)
loft('XY_Ear_Inner.L',[(.58,-.14,2.62,.12,.012),(.70,-.12,2.74,.11,.012),(.87,-.10,2.72,.07,.01),(.94,-.12,2.59,.004,.005)],inner,'Ear.L',24,16)

tail_sections=[(0,.36,.59,.20,.17),(.34,.64,.57,.205,.145),(.83,.88,.66,.23,.115),(1.35,1.02,.97,.29,.105),(1.73,1.04,1.48,.36,.10),(2.02,1.03,1.74,.28,.09),(2.21,1.015,1.70,.012,.012)]
tail, tail_ts=loft('XY_Shadow_Ribbon_Tail',tail_sections,rings=72,sides=24)

def front_y(x,z):
    v=1-(x/.88)**2-((z-2.04)/.77)**2
    return -.005-.67*math.sqrt(max(.04,v))

blink_meshes=[]
def eye_patch(name,cx,cz,rx,rz,depth,material,blink=True):
    verts=[];fs=[];rings=12;sides=48
    verts.append((cx,front_y(cx,cz)-depth,cz))
    for i in range(1,rings+1):
        r=i/rings
        for j in range(sides):
            a=2*pi*j/sides;x=cx+rx*r*cos(a);z=cz+rz*r*sin(a)
            y=front_y(x,z)-depth-.018*(1-r*r)
            verts.append((x,y,z))
    for j in range(sides):fs.append((0,1+j,1+(j+1)%sides))
    for i in range(rings-1):
        for j in range(sides):
            a=1+i*sides+j;b=1+i*sides+(j+1)%sides;fs.append((a,b,b+sides,a+sides))
    ob=mesh(name,verts,fs,material,face,'Head',1)
    if blink:
        ob.shape_key_add(name='Basis')
        key=ob.shape_key_add(name='Blink')
        for v in key.data:
            v.co.z=cz+(v.co.z-cz)*.025
            v.co.y=front_y(v.co.x,v.co.z)-depth
        blink_meshes.append(ob)
    return ob

for side,x in [('R',-.375),('L',.375)]:
    eye_patch('XY_Eye_Rim.'+side,x,2.085,.28,.355,.018,socket)
    eye_patch('XY_Eye_White.'+side,x,2.085,.248,.323,.032,ivory)
    eye_patch('XY_Pupil.'+side,x+.03,2.11,.15,.221,.064,pupil)
    eye_patch('XY_Glint_Main.'+side,x-.018,2.218,.035,.05,.089,glint)
    eye_patch('XY_Glint_Small.'+side,x+.10,2.087,.015,.022,.088,glint)

def stroke(name, pts, radius, material, bone='Head', col=face):
    cu=bpy.data.curves.new(name+'_Curve','CURVE');cu.dimensions='3D';cu.resolution_u=16
    cu.bevel_depth=radius;cu.bevel_resolution=4
    sp=cu.splines.new('BEZIER');sp.bezier_points.add(len(pts)-1)
    for b,p in zip(sp.bezier_points,pts):b.co=p;b.handle_left_type='AUTO';b.handle_right_type='AUTO'
    ob=bpy.data.objects.new(name,cu);col.objects.link(ob);cu.materials.append(material)
    bpy.context.view_layer.objects.active=ob;ob.select_set(True)
    bpy.ops.object.convert(target='MESH');ob=bpy.context.object
    ob.select_set(False)
    if bone:bound.append((ob,bone))
    return ob

ellipsoid('XY_Nose',(0,front_y(0,1.82)-.035,1.82),(.10,.055,.048),nosemat,'Head',face)
for s in [-1,1]:
    pts=[]
    for x,z in [(0,1.765),(.06*s,1.724),(.12*s,1.735),(.165*s,1.765)]:pts.append((x,front_y(x,z)-.022,z))
    stroke('XY_Smile_'+str(s),pts,.012,socket)
    x=.375*s
    pts=[(x-.10,front_y(x-.10,2.48)-.018,2.48),(x,front_y(x,2.515)-.018,2.515),(x+.08,front_y(x+.08,2.495)-.018,2.495)]
    stroke('XY_Brow_'+str(s),pts,.016,inner)
# Minimal toe grooves; no separate fingers or claws.
for side,x in [('R',-.38),('L',.38)]:
    for offset in [-.06,.06]:
        stroke('XY_Toe_'+side+str(offset),[(x+offset,-.435,.125),(x+offset,-.444,.16),(x+offset,-.427,.19)],.006,socket,'Foot.'+side,geo)

# Named deform rig. Feet stay planted while body breathes.
arm=bpy.data.armatures.new('XY_Skeleton');rig=bpy.data.objects.new('XY_RIG',arm);rigcol.objects.link(rig)
bpy.context.view_layer.objects.active=rig;rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
def bone(name,h,t,parent=None):
    b=arm.edit_bones.new(name);b.head=h;b.tail=t
    if parent:b.parent=arm.edit_bones[parent]
    return b
bone('Root',(0,0,0),(0,0,.3))
bone('Body',(0,0,.35),(0,0,1.3),'Root')
bone('Head',(0,0,1.40),(0,0,2.32),'Body')
for side,s in [('R',-1),('L',1)]:
    bone('Arm.'+side,(s*.35,-.20,1.3),(s*.39,-.39,.81),'Body')
    bone('Foot.'+side,(s*.38,0,.15),(s*.38,-.3,.15),'Root')
    bone('Ear.'+side,(s*.51,0,2.54),(s*.66,0,2.98),'Head')
tail_joints=[Vector(catmull(tail_sections,i/6)[:3]) for i in range(7)]
for i in range(6):bone('Tail.%02d'%i,tail_joints[i],tail_joints[i+1],'Body' if i==0 else 'Tail.%02d'%(i-1))
bpy.ops.object.mode_set(mode='OBJECT')
rig.show_in_front=True;arm.display_type='BBONE'
for pb in rig.pose.bones:pb.rotation_mode='XYZ'

def arm_mod(ob):
    mod=ob.modifiers.new('XY_Deform','ARMATURE');mod.object=rig;mod.use_deform_preserve_volume=True
    ob.parent=rig
for ob,b in bound:
    vg=ob.vertex_groups.new(name=b);vg.add(list(range(len(ob.data.vertices))),1,'REPLACE');arm_mod(ob)
for i in range(6):tail.vertex_groups.new(name='Tail.%02d'%i)
for vid,t in enumerate(tail_ts):
    u=max(0,min(5,t*6-.5));i=int(u);a=u-i
    tail.vertex_groups['Tail.%02d'%i].add([vid],1-a,'REPLACE')
    if i<5 and a>0:tail.vertex_groups['Tail.%02d'%(i+1)].add([vid],a,'REPLACE')
arm_mod(tail)
rig['blink']=0.0
rig.id_properties_ui('blink').update(min=0,max=1,description='0 = open; 1 = closed. Drives all eye layers together.')
for ob in blink_meshes:
    drv=ob.data.shape_keys.key_blocks['Blink'].driver_add('value').driver
    var=drv.variables.new();var.name='b';var.type='SINGLE_PROP';var.targets[0].id=rig;var.targets[0].data_path='["blink"]';drv.expression='b'
rig['character']='Xiaoying / 小影'
rig['design']='Everyday: mischievous. Collaboration: gentle and brave. Human retains decisions.'
rig['height_units']=3.24

# Studio and independent orthographic cameras.
def aim(ob,pt):ob.rotation_euler=(Vector(pt)-ob.location).to_track_quat('-Z','Y').to_euler()
def camera(name,loc,target,scale):
    d=bpy.data.cameras.new(name);ob=bpy.data.objects.new(name,d);stage.objects.link(ob);ob.location=loc;aim(ob,target);d.type='ORTHO';d.ortho_scale=scale;d.lens=55;return ob
hero=camera('CAM_Hero',(6,-11,5.3),(.45,.2,1.57),5.1)
camera('CAM_Front',(0,-12,1.62),(0,0,1.62),4.4)
camera('CAM_Left',(12,0,1.62),(0,0,1.62),4.4)
camera('CAM_Right',(-12,0,1.62),(0,0,1.62),4.4)
camera('CAM_Back',(0,12,1.62),(0,0,1.62),4.4)
camera('CAM_Top',(0,0,12),(0,0,0),5.0)
scene.camera=hero
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.015));floor=bpy.context.object;floor.name='STUDIO_Ground';move(floor,stage);floor.data.materials.append(floor_mat)
def light(name,loc,power,size,color):
    d=bpy.data.lights.new(name,'AREA');ob=bpy.data.objects.new(name,d);stage.objects.link(ob);ob.location=loc;d.energy=power;d.shape='DISK';d.size=size;d.color=color;aim(ob,(0,0,1.3))
light('KEY_Softbox',(-3.5,-4.5,7),750,5,(1,.88,.73))
light('FILL_Softbox',(4,-3,4.5),520,4,(.80,.88,1))
light('RIM_Softbox',(1.0,4,6),1000,3,(1,.91,.79))
world=bpy.data.worlds.new('XY_StudioWorld');scene.world=world;world.use_nodes=True
bg=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND');bg.inputs['Color'].default_value=(.30,.32,.36,1);bg.inputs['Strength'].default_value=.35
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True
scene.render.resolution_x=1200;scene.render.resolution_y=1200;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.view_settings.view_transform='AgX'

refpath='/Users/happy/Desktop/AdgaiWalker/output/xiaoying/assets/xiaoying-modeling-multiview-v1.png'
im=bpy.data.images.load(refpath,check_existing=True);im.pack()
ref=bpy.data.objects.new('REFERENCE_Multiview',None);refs.objects.link(ref);ref.empty_display_type='IMAGE';ref.data=im;ref.empty_display_size=5;ref.location=(-6,2,2);ref.rotation_euler=(pi/2,0,0);ref.hide_render=True;refs.hide_viewport=True

bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        area.spaces.active.region_3d.view_perspective='CAMERA'
        area.spaces.active.overlay.show_overlays=False
scene.frame_set(1)
bpy.context.view_layer.update()
os.makedirs(OUT,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT+'/xiaoying-character-v1.blend')
result={'scene':scene.name,'objects':len(scene.objects),'mesh_objects':sum(o.type=='MESH' for o in geo.objects)+sum(o.type=='MESH' for o in face.objects),'bones':len(arm.bones),'file':bpy.data.filepath}
