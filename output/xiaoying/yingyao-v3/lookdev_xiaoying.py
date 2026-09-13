"""Reference-aligned suede, rounded wing sections and recessed luminous eyes.
Run through the interactive Blender MCP in the existing XY3 scene.
"""
import bpy, math, os, ast, numpy as np
from math import sin,cos,pi,exp
from mathutils import Vector
from mathutils.bvhtree import BVHTree
OUT='/Users/happy/Desktop/AdgaiWalker/output/xiaoying/yingyao-v3'
sc=bpy.context.scene
assert sc.name=='XY3 • 小影 / 影鳐工作室'
body=bpy.data.objects['XY3_BODY • 一体影鳐'];fur=bpy.data.objects['XY3_FUR • 短绒细节'];root=bpy.data.objects['XY3_CTRL • 小影总控']
objects=[o for o in sc.objects if o.type=='MESH' and o.data.shape_keys]
original=bpy.app.driver_namespace.get('xy31_original')
if original is None:
    cachefile=OUT+'/before-lookdev-20260909/geometry.npz'
    if os.path.exists(cachefile):
        saved=np.load(cachefile);original={}
        for ob in objects:
            if ob.name+'::Basis' not in saved:continue
            original[ob.name]={k.name:saved[ob.name+'::'+k.name].copy() for k in ob.data.shape_keys.key_blocks}
    else:
        original={};flat={}
        for ob in objects:
            original[ob.name]={}
            for key in ob.data.shape_keys.key_blocks:
                a=np.empty(len(key.data)*3,dtype=np.float32);key.data.foreach_get('co',a);a=a.reshape((-1,3))
                original[ob.name][key.name]=a;flat[ob.name+'::'+key.name]=a
        np.savez_compressed(cachefile,**flat)
    bpy.app.driver_namespace['xy31_original']=original
def smooth(t):
    t=min(1,max(0,t));return t*t*(3-2*t)
def mid_surface(x,y):
    a=abs(x)/3.2;yc=.22*a*a
    oy=yc+(y-yc)/(1+.75*smooth((abs(x)-1.8)/1.4))
    return .235+.11*a*a+.20*sin(2.4*pi*a-.35)*a**1.8+.10*smooth((oy-.9)/.65)+.18*exp(-((abs(x)-2.17)/.52)**2)*smooth((-y-.08)/.62)
def skin(co):
    x,y,z=map(float,co);w=smooth((abs(x)-1.35)/1.2)
    mid=mid_surface(x,y)
    z=mid+(z-mid)*(1+.28*w)+.055*w
    footprint=exp(-(x/1.2)**4-(y/1.34)**4)*smooth((mid-z)/.075)
    z=z*(1-footprint)+(.012+.007*((x/1.2)**2+(y/1.34)**2))*footprint
    front=smooth((-y-.8)/.25)
    for cx in [-.48,.48]:
        u=(x-cx)/.27;v=(z-.64)/.145
        y+=.105*exp(-1.55*(u*u+v*v))*front
        y-=.027*exp(-((x-cx)/.32)**4-((z-.765)/.067)**2)*front
    return x,y,z
# Preserve old non-wing morphs; only the wing section bend law changes.
namespace={};module=ast.parse(open(OUT+'/build_xiaoying.py').read())
for node in module.body:
    if isinstance(node,ast.FunctionDef) and node.name in ['clamp','smooth','deform']:
        exec(compile(ast.Module(body=[node],type_ignores=[]),'xy_deform','exec'),globals(),namespace)
legacy=namespace['deform'];legacy.__globals__.update(namespace)
def deform(co,name):
    if name=='Tail_Sway':
        x,y,z=map(float,co);q=min(1,max(0,(y-.1)/1.55))
        return x+.25*q*q,y,z+.14*q*q*smooth((z-.05)/.20)
    if name not in ['Wing_L','Wing_R']:return legacy(co,name)
    x,y,z=map(float,co);sign=-1 if name=='Wing_L' else 1;s=sign*x
    if s<=.85:return x,y,z
    L=2.35;q=min(1,max(0,(s-.85)/L));a=abs(x)/3.2;yc=.22*a*a
    mid=mid_surface(x,y)+.055*smooth((abs(x)-1.35)/1.2)
    h=z-mid;alpha=1.75*q;dy=y-yc
    curl=.16*q*q-.26*y*q*q+.12*q*q*dy*dy/(.35+dy*dy)
    return sign*(.85+L*sin(alpha)/1.75-h*sin(alpha)),y-.28*q*q,mid+L*(1-cos(alpha))/1.75+h*cos(alpha)+curl
MORPHS=['Breath','Wing_L','Wing_R','Receive','Rest','Tail_Sway','Squash']
for ob in [body,fur]:
    basis=np.array([skin(c) for c in original[ob.name]['Basis']],dtype=np.float32)
    ob.data.vertices.foreach_set('co',basis.ravel())
    ob.data.shape_keys.key_blocks['Basis'].data.foreach_set('co',basis.ravel())
    for name in MORPHS:
        a=np.array([deform(c,name) for c in basis],dtype=np.float32)
        ob.data.shape_keys.key_blocks[name].data.foreach_set('co',a.ravel())
    rest=ob.data.attributes.get('XY_Rest') or ob.data.attributes.new('XY_Rest','FLOAT_VECTOR','POINT')
    rest.data.foreach_set('vector',basis.ravel())
    ob.data.update()
fur.hide_render=True
fur.hide_set(True)

# Rest-coordinate brushing remains attached while the pet breathes and bends.
mat=bpy.data.materials['XY3_MAT / 炭灰微绒 · 暖灰腹面']
nt=mat.node_tree;nt.nodes.clear();n=nt.nodes;l=nt.links
def node(kind,name,x,y):
    o=n.new(kind);o.label=name;o.name=name;o.location=(x,y);return o
p=node('ShaderNodeBsdfPrincipled','柔软炭灰麂皮',840,100)
out=node('ShaderNodeOutputMaterial','Surface',1130,100);l.new(p.outputs['BSDF'],out.inputs['Surface'])
p.inputs['Metallic'].default_value=0;p.inputs['Roughness'].default_value=.80
p.inputs['Specular IOR Level'].default_value=.20
p.inputs['Sheen Weight'].default_value=.12;p.inputs['Sheen Roughness'].default_value=.76
p.inputs['Sheen Tint'].default_value=(.080,.085,.09,1)
p.inputs['Coat Weight'].default_value=0;p.inputs['Subsurface Weight'].default_value=.045
p.inputs['Subsurface Radius'].default_value=(.45,.25,.16)
rest=node('ShaderNodeAttribute','随形静态坐标',-1250,120);rest.attribute_name='XY_Rest'
belly=node('ShaderNodeAttribute','柔和腹面过渡',-100,500);belly.attribute_name='XY_Belly'
def anis_noise(label,scale,loc):
    mul=node('ShaderNodeVectorMath',label+' · 梳理方向',loc[0],loc[1]);mul.operation='MULTIPLY';mul.inputs[1].default_value=scale
    l.new(rest.outputs['Vector'],mul.inputs[0])
    no=node('ShaderNodeTexNoise',label,loc[0]+210,loc[1]);no.inputs['Scale'].default_value=1;no.inputs['Detail'].default_value=2.4;no.inputs['Roughness'].default_value=.68
    l.new(mul.outputs['Vector'],no.inputs['Vector']);return no
nap=anis_noise('毫米级横向短绒',(14,90,90),(-1020,140))
fine=anis_noise('纤维间隙',(78,560,370),(-1020,-170))
cloud=anis_noise('轻微绒向色差',(1.4,3.7,2.7),(-1020,510))
warp_scale=node('ShaderNodeVectorMath','绒束自然偏转',-600,710);warp_scale.operation='SCALE';warp_scale.inputs['Scale'].default_value=.14;l.new(cloud.outputs['Color'],warp_scale.inputs[0])
warp=node('ShaderNodeVectorMath','弯曲梳理路径',-1200,-450);warp.operation='ADD';l.new(rest.outputs['Vector'],warp.inputs[0]);l.new(warp_scale.outputs['Vector'],warp.inputs[1])
for name in ['毫米级横向短绒 · 梳理方向','纤维间隙 · 梳理方向']:l.new(warp.outputs['Vector'],n[name].inputs[0])
base=node('ShaderNodeMixRGB','炭灰 / 暖灰',140,500);base.blend_type='MIX'
base.inputs[1].default_value=(.0128,.0136,.0152,1);base.inputs[2].default_value=(.095,.080,.063,1)
l.new(belly.outputs['Fac'],base.inputs[0])
variation=node('ShaderNodeMapRange','绒向明暗',-80,240)
variation.inputs['To Min'].default_value=.45;variation.inputs['To Max'].default_value=1.55;l.new(nap.outputs['Fac'],variation.inputs['Value'])
shade=node('ShaderNodeMixRGB','细密顺毛色泽',410,430);shade.blend_type='MULTIPLY';shade.inputs[0].default_value=.65
l.new(base.outputs[0],shade.inputs[1]);l.new(variation.outputs[0],shade.inputs[2])
vcloud=node('ShaderNodeMapRange','柔和色差范围',-100,700);vcloud.inputs['To Min'].default_value=.70;vcloud.inputs['To Max'].default_value=1.12;l.new(cloud.outputs['Fac'],vcloud.inputs['Value'])
blend=node('ShaderNodeMixRGB','柔软不均匀绒面',620,420);blend.blend_type='MULTIPLY';blend.inputs[0].default_value=1
l.new(shade.outputs[0],blend.inputs[1]);l.new(vcloud.outputs[0],blend.inputs[2]);l.new(blend.outputs[0],p.inputs['Base Color'])
bump=node('ShaderNodeBump','贴伏短绒凹凸',110,30);bump.inputs['Strength'].default_value=.70;bump.inputs['Distance'].default_value=.009;l.new(nap.outputs['Fac'],bump.inputs['Height'])
micro=node('ShaderNodeBump','微纤维',370,-70);micro.inputs['Strength'].default_value=.20;micro.inputs['Distance'].default_value=.00065
l.new(fine.outputs['Fac'],micro.inputs['Height']);l.new(bump.outputs['Normal'],micro.inputs['Normal']);l.new(micro.outputs['Normal'],p.inputs['Normal'])
rough=node('ShaderNodeMapRange','绒面粗糙度',400,-320);rough.inputs['To Min'].default_value=.74;rough.inputs['To Max'].default_value=.89;l.new(cloud.outputs['Fac'],rough.inputs['Value']);l.new(rough.outputs[0],p.inputs['Roughness'])
mat.diffuse_color=(.065,.059,.052,1)

# Reproject the eye patches into the deeper sockets for each body morph.
faces=[tuple(p.vertices) for p in body.data.polygons]
trees={}
for key in body.data.shape_keys.key_blocks:
    me=bpy.data.meshes.new('XY31_TMP');me.from_pydata([v.co[:] for v in key.data],[],faces);me.update()
    ob=bpy.data.objects.new('XY31_TMP',me);sc.collection.objects.link(ob)
    sub=ob.modifiers.new('projection','SUBSURF');sub.levels=2
    bpy.context.view_layer.update();trees[key.name]=BVHTree.FromObject(ob,bpy.context.evaluated_depsgraph_get())
    bpy.data.objects.remove(ob,do_unlink=True);bpy.data.meshes.remove(me)
for side in ['L','R']:
    for kind,offset in [('EYE_SOCKET',.010),('EYE_GOLD',.016),('PUPIL',.024)]:
        ob=bpy.data.objects['XY3_'+kind+'.'+side]
        for key in ob.data.shape_keys.key_blocks:
            source=original[ob.name][key.name];tree=trees.get(key.name,trees['Basis'])
            a=source.copy()
            for i,co in enumerate(a):
                x,y,z=map(float,co);hit=tree.ray_cast(Vector((x,-5,z)),Vector((0,1,0)))
                if hit[0]:a[i,1]=hit[0].y-offset+(.075 if kind=='PUPIL' and key.name=='Blink' else 0)
            key.data.foreach_set('co',a.ravel())
        a=np.array([v.co[:] for v in ob.data.shape_keys.key_blocks['Basis'].data],dtype=np.float32)
        ob.data.vertices.foreach_set('co',a.ravel())
        at=ob.data.attributes.get('XY_Rest') or ob.data.attributes.new('XY_Rest','FLOAT_VECTOR','POINT');at.data.foreach_set('vector',a.ravel())
        if kind=='EYE_SOCKET':ob.data.materials.clear();ob.data.materials.append(mat)
    eye=bpy.data.objects['XY3_EYE_GOLD.'+side];em=eye.data.materials[0];ep=next(n for n in em.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    ep.inputs['Roughness'].default_value=.63;ep.inputs['Specular IOR Level'].default_value=.1
    ep.inputs['Emission Color'].default_value=(1,.53,.15,1)
    for d in em.node_tree.animation_data.drivers:
        if 'Emission Strength' in d.data_path:d.driver.expression='3.2*g*(1-b)'
    for nd in em.node_tree.nodes:
        if nd.type=='MIX_RGB':nd.inputs[1].default_value=(1,.63,.235,1)

pm=bpy.data.materials['XY3_MAT / 深琥珀瞳孔'];pp=next(n for n in pm.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
pp.inputs['Base Color'].default_value=(.009,.006,.004,1);pp.inputs['Roughness'].default_value=.92;pp.inputs['Specular IOR Level'].default_value=.04;pp.inputs['Coat Weight'].default_value=0
for name in ['微笑阴影','微笑柔光边']:
    mm=bpy.data.materials['XY3_MAT / '+name];mp=next(n for n in mm.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    mp.inputs['Roughness'].default_value=.93;mp.inputs['Specular IOR Level'].default_value=.07
    if name=='微笑柔光边':mp.inputs['Base Color'].default_value=(.18,.147,.119,1)
for ob in [bpy.data.objects['XY3_FACE • 小小微笑'],bpy.data.objects['XY3_FACE • 唇缘柔光']]:
    for key in ob.data.shape_keys.key_blocks:
        a=original[ob.name][key.name].copy()
        for i in range(41):
            chunk=a[i*8:(i+1)*8];center=chunk.mean(axis=0);factor=(.34+.48*math.sin(pi*i/40)**.5)
            a[i*8:(i+1)*8]=center+(chunk-center)*factor
        key.data.foreach_set('co',a.ravel())
    ob.data.vertices.foreach_set('co',np.array([v.co[:] for v in ob.data.shape_keys.key_blocks['Basis'].data],dtype=np.float32).ravel())

# Large warm key, quiet fill and broad fabric highlights.
lights=[('XY3_LIGHT / 大柔光主灯',(-3.8,-4.0,6.0),1100,(1,.94,.86),4.5),('XY3_LIGHT / 中性填光',(4,-1,3.8),230,(.89,.93,1),5),('XY3_LIGHT / 翼缘轮廓光',(1,4,5),620,(1,.95,.86),4.8)]
for name,loc,energy,color,size in lights:
    ob=bpy.data.objects[name];ob.location=loc;ob.data.energy=energy;ob.data.color=color;ob.data.size=size;ob.rotation_euler=(Vector((0,0,.6))-ob.location).to_track_quat('-Z','Y').to_euler()
def driver(target,path,variables,expression,index=None):
    fc=target.driver_add(path) if index is None else target.driver_add(path,index)
    d=fc.driver
    while d.variables:d.variables.remove(d.variables[0])
    for name,prop in variables:
        v=d.variables.new();v.name=name;v.type='SINGLE_PROP';v.targets[0].id=root;v.targets[0].data_path='["'+prop+'"]'
    d.expression=expression
support=bpy.data.objects.get('XY3_RIG / 柔软接地')
if support is None:
    support=bpy.data.objects.new('XY3_RIG / 柔软接地',None);root.users_collection[0].objects.link(support);support.empty_display_size=.15
root.parent=support
driver(support,'location',[('s','Rest')],'-(0.008+0.022*s)',2)
for side,cx in [('L',-.48),('R',.48)]:
    name='XY3_LIGHT / 眼窝暖光.'+side;ob=bpy.data.objects.get(name)
    if ob is None:
        data=bpy.data.lights.new(name,'POINT');ob=bpy.data.objects.new(name,data);bpy.data.collections['XY3 / 02 面部表情'].objects.link(ob)
    ob.parent=root;hit=trees['Basis'].ray_cast(Vector((cx,-5,.64)),Vector((0,1,0)))[0]
    ob.location=(cx,hit.y-.08,.64);ob.data.color=(1,.53,.21);ob.data.shadow_soft_size=.10
    driver(ob.data,'energy',[('g','Glow'),('b','Blink_'+side)],'.55*g*(1-b)')
    driver(ob,'location',[('r','Rest')],'.64-.1458*r',2)
bg=next(n for n in sc.world.node_tree.nodes if n.type=='BACKGROUND');bg.inputs[0].default_value=(.78,.755,.71,1);bg.inputs[1].default_value=.23
gm=bpy.data.materials['XY3_MAT / 暖白摄影背景'];gp=next(n for n in gm.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
gp.inputs['Base Color'].default_value=(.94,.883,.779,1);gp.inputs['Emission Color'].default_value=(.94,.883,.779,1);gp.inputs['Emission Strength'].default_value=.05
ground_link=bpy.data.collections.get('XY3 / 地面照明接收组') or bpy.data.collections.new('XY3 / 地面照明接收组')
ground=bpy.data.objects['XY3_STAGE • 无缝暖白地面']
if ground.name not in ground_link.objects:ground_link.objects.link(ground)
name='XY3_LIGHT / 奶油背景柔光';ob=bpy.data.objects.get(name)
if ob is None:
    data=bpy.data.lights.new(name,'AREA');ob=bpy.data.objects.new(name,data);bpy.data.collections['XY3 / 05 摄影棚'].objects.link(ob)
ob.location=(0,0,7);ob.rotation_euler=(0,0,0);ob.data.energy=2500;ob.data.shape='DISK';ob.data.size=7;ob.data.color=(1,.98,.93)
ob.light_linking.receiver_collection=ground_link
sc.view_settings.exposure=.35
sc['xy_lookdev']='Reference-aligned brushed suede, volumetric wing curl, recessed warm eyes · 2026-09-09'
sc.frame_set(167);sc.camera=bpy.data.objects['XY3_CAM / 01 Hero']
sc.render.engine='CYCLES';sc.cycles.samples=48;sc.cycles.use_denoising=True
sc.render.resolution_x=1440;sc.render.resolution_y=1080;sc.render.resolution_percentage=70
sc.render.filepath=OUT+'/lookdev-check.png'
root.update_tag();bpy.context.view_layer.update()
bpy.app.driver_namespace['xy31_deform']=deform
listen=bpy.data.actions.get('XY3 / 03_Listen / 倾听 · 侧身专注')
if listen:
    for layer in listen.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for fc in bag.fcurves:
                    if fc.data_path=='location' and fc.array_index==2:
                        for point in fc.keyframe_points:
                            point.co[1]=.016 if round(point.co[0]) in [31,61] else 0
                        fc.update()
    listen['xy31_contact_corrected']=True
result={'surface':'directional brushed suede','wing_sections':'rounded and rotated','face':'recessed','frame':sc.frame_current}
