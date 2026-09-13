import bpy, math
from mathutils import Vector
ns=bpy.app.driver_namespace['xy3_build'];scene=ns['scene'];body=ns['body'];fur=ns['fur'];root=ns['root'];deform=ns['deform']
m=bpy.data.materials['XY3_MAT / 炭灰微绒 · 暖灰腹面'];p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
p.inputs['Specular IOR Level'].default_value=.18;p.inputs['Sheen Weight'].default_value=.065
if not fur.get('xy_fur_polished'):
    for key in fur.data.shape_keys.key_blocks:
        for i in range(0,len(key.data),7):
            c=(key.data[i].co+key.data[i+1].co+key.data[i+2].co)/3
            for j in range(7):key.data[i+j].co=c+(key.data[i+j].co-c)*.28
    for i in range(0,len(fur.data.vertices),7):
        c=(fur.data.vertices[i].co+fur.data.vertices[i+1].co+fur.data.vertices[i+2].co)/3
        for j in range(7):fur.data.vertices[i+j].co=c+(fur.data.vertices[i+j].co-c)*.28
    fur['xy_fur_polished']=True
fur.data.materials.clear();fur.data.materials.append(m)
def smooth(t):
    t=max(0,min(1,t));return t*t*(3-2*t)
if not body.get('xy_wing_polished'):
    for ob in [body,fur]:
        for v in ob.data.vertices:
            x,y,z=v.co
            c=.22*(abs(x)/3.2)**2
            y=c+(y-c)*(1+.75*smooth((abs(x)-1.8)/1.4))
            z+=.18*math.exp(-((abs(x)-2.17)/.52)**2)*smooth((-y-.08)/.62)
            v.co=(x,y,z)
        for dst,src in zip(ob.data.shape_keys.key_blocks['Basis'].data,ob.data.vertices):dst.co=src.co
        for key in ob.data.shape_keys.key_blocks:
            if key.name!='Basis':
                for dst,src in zip(key.data,ob.data.vertices):dst.co=deform(src.co,key.name)
body['xy_wing_polished']=True
for side in ['L','R']:
    eye=bpy.data.objects['XY3_EYE_GOLD.'+side]
    pupil=bpy.data.objects['XY3_PUPIL.'+side]
    if not eye.get('xy_blink_polished'):
        mat=eye.data.materials[0].copy();mat.name='XY3_MAT / 暖金眼光.'+side
        eye.data.materials.clear();eye.data.materials.append(mat)
        p=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
        mix=mat.node_tree.nodes.new('ShaderNodeMixRGB')
        mix.inputs[1].default_value=(1,.74,.34,1)
        mix.inputs[2].default_value=(.015,.012,.010,1)
        ns['drive'](mix.inputs[0],'default_value','Blink_'+side)
        mat.node_tree.links.new(mix.outputs[0],p.inputs['Base Color'])
        fc=p.inputs['Emission Strength'].driver_add('default_value')
        d=fc.driver
        while d.variables:d.variables.remove(d.variables[0])
        for name,prop in [('g','Glow'),('b','Blink_'+side)]:
            v=d.variables.new();v.name=name;v.type='SINGLE_PROP';v.targets[0].id=root;v.targets[0].data_path='["'+prop+'"]'
        d.expression='1.5*g*(1-b)'
        for v in pupil.data.shape_keys.key_blocks['Blink'].data:v.co.y+=.085
        eye['xy_blink_polished']=True
for tr in root.animation_data.nla_tracks:
    for strip in tr.strips:
        strip.blend_in=10
        strip.blend_out=10
hero=bpy.data.objects['XY3_CAM / 01 Hero'];hero.location=(-2.2,-9,3.7)
hero.rotation_euler=(Vector((0,0,.7))-hero.location).to_track_quat('-Z','Y').to_euler()
scene.camera=hero
for marker in scene.timeline_markers:
    name='XY3_CAM / 05 Interaction' if marker.frame==376 else ('XY3_CAM / 06 Expression' if marker.frame==676 else 'XY3_CAM / 01 Hero')
    marker.camera=bpy.data.objects[name]
scene.frame_set(167)
root.update_tag();bpy.context.view_layer.update()
result={'polished':True,'current_frame':scene.frame_current}
