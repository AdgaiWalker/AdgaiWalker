import bpy, math, bmesh, json, os
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from math import sin, cos, pi, exp, sqrt

OUT = '/Users/happy/Desktop/AdgaiWalker/output/xiaoying/yingyao-v3'
os.makedirs(OUT, exist_ok=True)
scene = bpy.context.scene
assert scene.name == 'Codex_Empty_Scene' and len(scene.objects) == 0, 'Build requires the inspected empty scene'
scene.name = 'XY3 • 小影 / 影鳐工作室'
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 0.05
scene.unit_settings.length_unit = 'CENTIMETERS'
scene.render.fps = 30

def collection(name):
    c = bpy.data.collections.new('XY3 / ' + name)
    scene.collection.children.link(c)
    return c

character = collection('01 连续身体')
face_col = collection('02 面部表情')
controls = collection('03 动作控制')
interact = collection('04 承接与表达')
studio = collection('05 摄影棚')

def link(obj, col):
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    col.objects.link(obj)
    obj['xy_version'] = '3.0'
    return obj

root = bpy.data.objects.new('XY3_CTRL • 小影总控', None)
controls.objects.link(root)
root.empty_display_type = 'CIRCLE'
root.empty_display_size = 0.65
root['xy_version'] = '3.0'
PROPS = {
    'Breath': (0.0, 0, 1, '呼吸：身体缓慢膨胀，不改变腹部落地位置'),
    'Wing_L': (0.0, -0.15, 1, '左翼卷起，连续弯曲而非刚性旋转'),
    'Wing_R': (0.0, -0.15, 1, '右翼卷起，连续弯曲而非刚性旋转'),
    'Receive': (0.0, 0, 1, '温柔承接：背部形成浅托盘，双翼与后缘环抱'),
    'Rest': (0.0, 0, 1, '休息：降低重心，放松铺展'),
    'Tail_Sway': (0.0, -1, 1, '身体后缘轻轻摆动'),
    'Squash': (0.0, 0, 1, '开心蓄力时轻微压缩'),
    'Blink_L': (0.0, 0, 1, '左眼闭合：眼眶、发光眼与瞳孔同步贴合曲面'),
    'Blink_R': (0.0, 0, 1, '右眼闭合：眼眶、发光眼与瞳孔同步贴合曲面'),
    'Gaze_X': (0.0, -1, 1, '水平视线'),
    'Glow': (1.0, 0.15, 1.5, '温暖目光亮度'),
    'Signal': (0.0, 0, 1, '连接表达：双翼间的暖金信号线'),
    'Cargo': (0.0, 0, 1, '承接演示道具出现程度'),
}
for name, (value, lo, hi, desc) in PROPS.items():
    root[name] = value
    root.id_properties_ui(name).update(min=lo, max=hi, soft_min=lo, soft_max=hi, description=desc)

def drive(block, data_path, prop, expression='v', index=None):
    fc = block.driver_add(data_path) if index is None else block.driver_add(data_path, index)
    d = fc.driver
    d.type = 'SCRIPTED'
    var = d.variables.new()
    var.name = 'v'
    var.type = 'SINGLE_PROP'
    var.targets[0].id = root
    var.targets[0].data_path = '["' + prop + '"]'
    d.expression = expression
    return fc

def principled(name, color, roughness=0.6, metallic=0):
    mat = bpy.data.materials.new('XY3_MAT / ' + name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    p = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = roughness
    p.inputs['Metallic'].default_value = metallic
    return mat, p

body_mat, p = principled('炭灰微绒 · 暖灰腹面', (0.055, 0.049, 0.044), 0.83)
p.inputs['Sheen Weight'].default_value = 0.13
p.inputs['Sheen Tint'].default_value = (.10, .092, .085, 1)
p.inputs['Sheen Roughness'].default_value = 0.65
p.inputs['Subsurface Weight'].default_value = 0.035
nt = body_mat.node_tree
n, l = nt.nodes, nt.links
tc = n.new('ShaderNodeTexCoord')
noise = n.new('ShaderNodeTexNoise')
noise.inputs['Scale'].default_value = 48
noise.inputs['Detail'].default_value = 3
noise.inputs['Roughness'].default_value = .7
l.new(tc.outputs['Object'], noise.inputs['Vector'])
fine = n.new('ShaderNodeTexNoise')
fine.inputs['Scale'].default_value = 245
fine.inputs['Detail'].default_value = 2
l.new(tc.outputs['Object'], fine.inputs['Vector'])
bump = n.new('ShaderNodeBump')
bump.inputs['Strength'].default_value = .32
bump.inputs['Distance'].default_value = .017
l.new(noise.outputs['Fac'], bump.inputs['Height'])
micro = n.new('ShaderNodeBump')
micro.inputs['Strength'].default_value = .11
micro.inputs['Distance'].default_value = .0025
l.new(fine.outputs['Fac'], micro.inputs['Height'])
l.new(bump.outputs['Normal'], micro.inputs['Normal'])
l.new(micro.outputs['Normal'], p.inputs['Normal'])
attr = n.new('ShaderNodeAttribute')
attr.attribute_name = 'XY_Belly'
blend = n.new('ShaderNodeMixRGB')
blend.blend_type = 'MIX'
blend.inputs[1].default_value = (.015, .014, .014, 1)
blend.inputs[2].default_value = (.265, .229, .19, 1)
l.new(attr.outputs['Fac'], blend.inputs[0])
tonal = n.new('ShaderNodeMapRange')
tonal.inputs['From Min'].default_value = 0
tonal.inputs['From Max'].default_value = 1
tonal.inputs['To Min'].default_value = .78
tonal.inputs['To Max'].default_value = 1.12
l.new(noise.outputs['Fac'], tonal.inputs['Value'])
mult = n.new('ShaderNodeMixRGB')
mult.blend_type = 'MULTIPLY'
mult.inputs[0].default_value = 1
l.new(blend.outputs[0], mult.inputs[1])
l.new(tonal.outputs[0], mult.inputs[2])
l.new(mult.outputs[0], p.inputs['Base Color'])

socket_mat, ps = principled('柔软眼窝', (.021, .017, .013), .78)
ps.inputs['Sheen Weight'].default_value = .24
eye_mat, pe = principled('暖金眼光', (1, .74, .34), .27)
pe.inputs['Emission Color'].default_value = (1, .59, .19, 1)
drive(pe.inputs['Emission Strength'], 'default_value', 'Glow', 'v*1.5')
pupil_mat, pp = principled('深琥珀瞳孔', (.014, .009, .005), .31)
pp.inputs['Coat Weight'].default_value = .22
mouth_mat, _ = principled('微笑阴影', (.025, .017, .012), .8)
lip_mat, _ = principled('微笑柔光边', (.235, .194, .15), .8)

def clamp(v, a=0., b=1.):
    return min(b, max(a, v))

def smooth(v):
    t = clamp(v)
    return t*t*(3-2*t)

def body_point(phi, theta):
    r, c = sin(phi), cos(phi)
    ca, sa = cos(theta), sin(theta)
    x = 3.2*r*ca*(.68+.32*abs(ca)**1.8)
    y = r*sa*(1.42 if sa < 0 else 1.58)*(.84+.16*abs(sa))*(1+.50*(abs(x)/3.2)**3) + .22*(abs(x)/3.2)**2
    a = abs(x)/3.2
    mid = .235+.11*a*a+.20*sin(2.4*pi*a-.35)*a**1.8 + .10*smooth((y-.9)/.65)
    thick = (.19+.955*exp(-(abs(x)/1.31)**2.7)+.22*a*a) if c >= 0 else (.165+.17*a*a)
    z = mid+c*thick
    for cx in [-.48, .48]:
        pocket = exp(-((x-cx)/.28)**4-((z-.64)/.15)**4)*smooth((-y-.8)/.3)
        y += .025*pocket
    return (x,y,z)

N, M = 128, 64
verts = [body_point(0,0)]
belly = [0.]
for j in range(1,M):
    phi = pi*j/M
    for i in range(N):
        verts.append(body_point(phi, 2*pi*i/N))
        belly.append(smooth((.10-cos(phi))/.23))
verts.append(body_point(pi,0))
bottom = len(verts)-1
faces = []
for i in range(N):
    faces.append((0,1+i,1+(i+1)%N))
for j in range(M-2):
    a, b = 1+j*N, 1+(j+1)*N
    for i in range(N):
        faces.append((a+i,b+i,b+(i+1)%N,a+(i+1)%N))
for i in range(N):
    faces.append((1+(M-2)*N+i,bottom,1+(M-2)*N+(i+1)%N))
mesh = bpy.data.meshes.new('XY3 / 连续封闭四边面拓扑')
mesh.from_pydata(verts, [], faces)
mesh.update()
bm=bmesh.new(); bm.from_mesh(mesh)
bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
bm.to_mesh(mesh); bm.free()
body=bpy.data.objects.new('XY3_BODY • 一体影鳐', mesh)
character.objects.link(body)
body.parent=root
body['xy_version']='3.0'
body['design_dimensions']='Neutral span 320 mm; depth approx. 150 mm; height approx. 69 mm'
body['construction']='Closed continuous surface; wings and torso share topology; editable subdivision'
mesh.materials.append(body_mat)
for poly in mesh.polygons: poly.use_smooth=True
attribute=mesh.attributes.new('XY_Belly', 'FLOAT', 'POINT')
for d,v in zip(attribute.data,belly): d.value=v
uv=mesh.uv_layers.new(name='XY_Unwrap')
for poly in mesh.polygons:
    longitudes=[]
    for vi in poly.vertices:
        longitudes.append(((vi-1)%N)/N if vi not in (0,bottom) else .5)
    seam=max(longitudes)-min(longitudes)>.5
    for li,vi,u in zip(poly.loop_indices,poly.vertices,longitudes):
        if seam and u<.5: u+=1
        v=0 if vi==0 else (1 if vi==bottom else (1+(vi-1)//N)/M)
        uv.data[li].uv=(u,v)
sub=body.modifiers.new('柔软曲面 / 可编辑细分', 'SUBSURF')
sub.levels=2; sub.render_levels=2

MORPHS=['Breath','Wing_L','Wing_R','Receive','Rest','Tail_Sway','Squash']
def deform(co, name):
    x,y,z=co
    if name=='Breath':
        w=exp(-(x/1.55)**4-(y/1.6)**4)
        return (x*(1+.012*w), y, z+.065*w*smooth((z-.19)/.75))
    if name in ('Wing_L','Wing_R'):
        sign=-1 if name=='Wing_L' else 1
        q=clamp((sign*x-.85)/2.35)
        x += sign*2.35*(sin(q*1.5)/1.5-q)
        z += 2.35*(1-cos(q*1.5))/1.5 + q*q*(.16-.9*y)
        y -= .38*q*q
    elif name=='Receive':
        q=clamp((abs(x)-.88)/2.32)
        x -= (1 if x>=0 else -1)*.49*q*q
        z += 1.04*q*q
        dip=exp(-(x/1.13)**4-(y/.87)**4)*smooth((y+.92)/.38)
        z -= .87*dip*smooth((z-.25)/.73)
        z += .43*exp(-(x/1.8)**4)*smooth((y-.52)/.85)
        y -= .11*smooth((y-.4)/1.1)
    elif name=='Rest':
        x*=1.045; y*=1.015; z=.10+(z-.10)*.73
    elif name=='Tail_Sway':
        q=clamp((y-.1)/1.55)
        x+=.25*q*q; z+=.14*q*q
    elif name=='Squash':
        x*=1.06; y*=1.025; z=.075+(z-.075)*.82
    return (x,y,z)

def morphs(obj):
    obj.shape_key_add(name='Basis')
    for name in MORPHS:
        key=obj.shape_key_add(name=name)
        key.slider_min=PROPS[name][1]
        for v, src in zip(key.data,obj.data.vertices): v.co=deform(src.co,name)
        drive(key,'value',name)
    return obj
morphs(body)
tree=BVHTree.FromPolygons([Vector(v) for v in verts], [tuple(f) for f in faces])
def front_y(x,z):
    hit=tree.ray_cast(Vector((x,-5,z)),Vector((0,1,0)))
    if hit[0] is None: raise ValueError('Facial projection missed '+str((x,z)))
    return hit[0].y

def patch(name,cx,cz,rx,rz,material,offset,tilt=0,blink=True,gaze=False):
    count,rings=64,10
    specs=[(0.,0.)]
    for j in range(1,rings+1):
        r=j/rings
        for i in range(count): specs.append((r,2*pi*i/count))
    def coordinates(close=0, gaze_amount=0):
        vs=[]
        for r,t in specs:
            u=r*cos(t)
            x=cx+rx*u+gaze_amount*.045
            baseline=cz+tilt*u
            dz=rz*r*sin(t)*(.68+.32*abs(sin(t)))
            z=baseline+dz*(1-close*.96)+close*.035*(1-u*u)
            y=front_y(x,z)-offset-.021*(1-r*r)*(1-close*.8)
            vs.append((x,y,z))
        return vs
    vs=coordinates()
    fs=[(0,1+i,1+(i+1)%count) for i in range(count)]
    for j in range(rings-1):
        a,b=1+j*count,1+(j+1)*count
        for i in range(count):fs.append((a+i,b+i,b+(i+1)%count,a+(i+1)%count))
    me=bpy.data.meshes.new(name+' / surface')
    me.from_pydata(vs,[],fs); me.update()
    ob=bpy.data.objects.new(name,me); face_col.objects.link(ob)
    ob.parent=root; ob['xy_version']='3.0'; me.materials.append(material)
    for p in me.polygons:p.use_smooth=True
    morphs(ob)
    if blink:
        key=ob.shape_key_add(name='Blink')
        for v,co in zip(key.data,coordinates(close=1)):v.co=co
        drive(key,'value','Blink_L' if cx<0 else 'Blink_R')
    if gaze:
        key=ob.shape_key_add(name='Look')
        key.slider_min=-1
        for v,co in zip(key.data,coordinates(gaze_amount=1)):v.co=co
        drive(key,'value','Gaze_X')
    return ob

eyes=[]
for side,cx in [('L',-.48),('R',.48)]:
    tilt=.026*(1 if cx>0 else -1)
    patch('XY3_EYE_SOCKET.'+side,cx,.64,.232,.101,socket_mat,.008,tilt)
    eyes.append(patch('XY3_EYE_GOLD.'+side,cx,.641,.213,.080,eye_mat,.020,tilt))
    patch('XY3_PUPIL.'+side,cx+(.128 if cx<0 else -.128),.654,.061,.049,pupil_mat,.037,tilt*.3,gaze=True)

def tube_mesh(name,points,radius,mat,col=face_col,closed=False,animate=True):
    vertices=[]; fs=[]; sides=8
    for i,p in enumerate(points):
        p=Vector(p)
        tangent=Vector(points[(i+1)%len(points)])-Vector(points[i-1]) if closed or (i>0 and i<len(points)-1) else (Vector(points[min(i+1,len(points)-1)])-Vector(points[max(0,i-1)]))
        tangent.normalize()
        ref=Vector((0,0,1)) if abs(tangent.z)<.9 else Vector((0,1,0))
        u=tangent.cross(ref).normalized(); v=tangent.cross(u).normalized()
        for k in range(sides):vertices.append(p+radius*(u*cos(2*pi*k/sides)+v*sin(2*pi*k/sides)))
    n=len(points)
    for i in range(n if closed else n-1):
        for k in range(sides):fs.append((i*sides+k,((i+1)%n)*sides+k,((i+1)%n)*sides+(k+1)%sides,i*sides+(k+1)%sides))
    if not closed:
        fs.append(tuple(reversed(range(sides))));fs.append(tuple((n-1)*sides+k for k in range(sides)))
    me=bpy.data.meshes.new(name+' / tube');me.from_pydata(vertices,[],fs);me.update()
    ob=bpy.data.objects.new(name,me);col.objects.link(ob);ob.parent=root;ob['xy_version']='3.0'
    me.materials.append(mat)
    for p in me.polygons:p.use_smooth=True
    if animate:morphs(ob)
    return ob

smile=[]; lip=[]
for i in range(41):
    u=-1+2*i/40; x=.13*u; z=.384+.052*u*u
    smile.append((x,front_y(x,z)-.013,z))
    z-=.017
    lip.append((x*.93,front_y(x*.93,z)-.017,z))
tube_mesh('XY3_FACE • 小小微笑',smile,.011,mouth_mat)
tube_mesh('XY3_FACE • 唇缘柔光',lip,.006,lip_mat)

ground_mat,gp=principled('暖白摄影背景',(.86,.807,.731),.89)
gp.inputs['Emission Color'].default_value=(.86,.807,.731,1)
gp.inputs['Emission Strength'].default_value=.45
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,0))
ground=link(bpy.context.object,studio);ground.name='XY3_STAGE • 无缝暖白地面';ground.data.materials.append(ground_mat)

def aim(obj,target):obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
def area(name,loc,power,color,size,target=(0,0,.5)):
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.color=color;data.shape='DISK';data.size=size
    ob=bpy.data.objects.new(name,data);studio.objects.link(ob);ob.location=loc;aim(ob,target);return ob
area('XY3_LIGHT / 大柔光主灯',(-3.8,-4.5,6.5),800,(1,.88,.73),5)
area('XY3_LIGHT / 中性填光',(4,-2,4.4),540,(.81,.89,1),4.5)
area('XY3_LIGHT / 翼缘轮廓光',(1.2,4,5.6),1050,(1,.9,.76),4)
world=bpy.data.worlds.new('XY3_WORLD • 中性棚光');world.use_nodes=True
bg=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND')
bg.inputs[0].default_value=(.65,.70,.8,1)
bg.inputs[1].default_value=.35;scene.world=world

def camera(name,loc,target,scale):
    data=bpy.data.cameras.new(name);data.type='ORTHO';data.ortho_scale=scale;data.lens=55
    ob=bpy.data.objects.new(name,data);studio.objects.link(ob);ob.location=loc;aim(ob,target);return ob
hero=camera('XY3_CAM / 01 Hero',(3.3,-8.8,3.6),(0,0,.7),7.9)
front=camera('XY3_CAM / 02 Front',(0,-10,2.7),(0,0,.7),7.7)
top=camera('XY3_CAM / 03 Top',(0,-.001,10),(0,0,0),7.6)
detail=camera('XY3_CAM / 04 Face',(1.1,-7,2.3),(0,-1.0,.61),3)
scene.camera=hero
scene.render.engine='CYCLES'
scene.cycles.samples=48
scene.cycles.use_denoising=True
scene.render.resolution_x=1440;scene.render.resolution_y=1080;scene.render.resolution_percentage=75
scene.render.image_settings.file_format='PNG'
scene.view_settings.view_transform='AgX'
try:scene.view_settings.look='AgX - Medium High Contrast'
except:pass
scene.render.film_transparent=False
root['Wing_L']=1.0;root['Wing_R']=.18;root['Breath']=.3
scene.frame_start=1;scene.frame_end=1200
scene.frame_set(1)
bpy.context.view_layer.update()
for ob in bpy.context.selected_objects:ob.select_set(False)
body.select_set(True);bpy.context.view_layer.objects.active=body
for a in bpy.context.screen.areas:
    if a.type=='VIEW_3D':
        a.spaces.active.region_3d.view_perspective='CAMERA'
        a.spaces.active.shading.type='MATERIAL'
        a.spaces.active.overlay.show_overlays=False
scene.render.filepath=OUT+'/01-hero-preview.png'
bpy.app.driver_namespace['xy3_build'] = {'root':root,'body':body,'scene':scene,'deform':deform,'morphs':morphs,'tube_mesh':tube_mesh,'drive':drive,'principled':principled,'link':link,'interact':interact,'studio':studio,'PROPS':PROPS,'OUT':OUT}
result={'scene':scene.name,'objects':len(scene.objects),'body_vertices':len(mesh.vertices),'body_faces':len(mesh.polygons),'controls':list(PROPS),'output':OUT}
