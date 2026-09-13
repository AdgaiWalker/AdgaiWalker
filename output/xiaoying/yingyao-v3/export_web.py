"""Run in a separate Blender process; never save over the source .blend.

Exports the original shape keys and sampled motions. Only the fur density and
material representation change. GLB animation channels are assembled explicitly
because this character uses custom-property drivers rather than armature clips.
"""
import bpy, json, math, struct
from pathlib import Path
import numpy as np

BASE = Path(__file__).resolve().parent
OUT = BASE.parents[2] / 'public' / 'xiaoying'
OUT.mkdir(parents=True, exist_ok=True)
sc = bpy.context.scene
root = bpy.data.objects['XY3_CTRL • 小影总控']
body = bpy.data.objects['XY3_BODY • 一体影鳐']

# Keep one evenly sampled subset of the existing groom, with identical morphs.
fur = bpy.data.objects['XY3_FUR / 贴伏短绒']
ids = np.array([i + j for i in range(0, len(fur.data.vertices), 100) for j in range(5)], dtype=np.int32)
coords = np.empty(len(fur.data.vertices) * 3, dtype=np.float32)
fur.data.shape_keys.key_blocks[0].data.foreach_get('co', coords)
faces = [face for b in range(0, len(ids), 5) for face in [(b,b+1,b+2,b+3),(b+3,b+2,b+4)]]
mesh = bpy.data.meshes.new('Web groom')
mesh.from_pydata(coords.reshape(-1,3)[ids].tolist(), [], faces)
webfur = bpy.data.objects.new('XY_WEB_FUR', mesh)
sc.collection.objects.link(webfur)
webfur.parent = root
for key in fur.data.shape_keys.key_blocks:
    key.data.foreach_get('co', coords)
    webfur.shape_key_add(name=key.name).data.foreach_set('co', coords.reshape(-1,3)[ids].ravel())
for p in mesh.polygons: p.use_smooth = True
belly = np.empty(len(fur.data.vertices), dtype=np.float32)
fur.data.attributes['XY_Belly'].data.foreach_get('value', belly)
colors = mesh.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='POINT')
for idx, b in enumerate(belly[ids]):
    colors.data[idx].color = (0.017*(1-b)+0.105*b,0.018*(1-b)+0.087*b,0.02*(1-b)+0.068*b,1)
for o in [fur, bpy.data.objects['XY3_FUR • 短绒细节']]:
    bpy.data.objects.remove(o, do_unlink=True)

objects = [o for o in sc.objects if o.type == 'MESH' and o.data.shape_keys]
rig = root.parent
motion_objects = [root, rig]
states = [s for s in json.loads((BASE/'states.json').read_text()) if s['id'] in ['01_Idle','02_Hello','03_Listen','05_Think','07_Joy','08_Sleep']]
samples = {}
for state in states:
    frames = sorted(set(range(state['start'],state['end']+1,2)) | {state['end']})
    rows = []
    for frame in frames:
        sc.frame_set(frame)
        rows.append({
            'time': (frame-state['start'])/30,
            'weights': {o.name: [float(root[k.name]) if o == webfur else k.value for k in o.data.shape_keys.key_blocks[1:]] for o in objects},
            'transforms': {o.name: {'translation': [o.location.x,o.location.z,-o.location.y], 'rotation': [o.rotation_euler.to_quaternion().x,o.rotation_euler.to_quaternion().z,-o.rotation_euler.to_quaternion().y,o.rotation_euler.to_quaternion().w], 'scale': [o.scale.x,o.scale.z,o.scale.y]} for o in motion_objects},
        })
    samples[state['id']] = rows
print('Sampled six original motions', flush=True)

# Bake the actual shader into compact textures. The original file stays intact.
for o in objects:
    o.data.shape_keys.animation_data_clear()
    for k in o.data.shape_keys.key_blocks: k.value = 0
for o in motion_objects:
    o.animation_data_clear()
    o.location=(0,0,0); o.rotation_euler=(0,0,0); o.scale=(1,1,1)
for o in sc.objects: o.select_set(False)
body.select_set(True)
bpy.context.view_layer.objects.active=body
for m in body.modifiers: m.show_render=False; m.show_viewport=False
sc.render.engine='CYCLES'; sc.cycles.samples=8
sc.render.bake.margin=8
mat=body.active_material
images={}
for kind in ['DIFFUSE','NORMAL']:
    img=bpy.data.images.new('XY_WEB_'+kind,width=1024,height=1024,alpha=False)
    if kind=='NORMAL': img.colorspace_settings.name='Non-Color'
    tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=img
    mat.node_tree.nodes.active=tex
    bpy.ops.object.bake(type=kind,pass_filter={'COLOR'} if kind=='DIFFUSE' else set(),use_clear=True)
    img.filepath_raw=str(OUT/('fur-color.png' if kind=='DIFFUSE' else 'fur-normal.png'))
    img.file_format='PNG';img.save();images[kind]=img
print('Baked original fur color and normal',flush=True)

def simple(name,color,roughness=0.8):
    m=bpy.data.materials.new(name);m.use_nodes=True
    p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value=color;p.inputs['Roughness'].default_value=roughness
    return m,p

skin,p=simple('XY_WEB_SOFT_FUR',(1,1,1,1))
nt=skin.node_tree
tex=nt.nodes.new('ShaderNodeTexImage');tex.image=images['DIFFUSE'];nt.links.new(tex.outputs['Color'],p.inputs['Base Color'])
tex=nt.nodes.new('ShaderNodeTexImage');tex.image=images['NORMAL']
normal=nt.nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.5
nt.links.new(tex.outputs['Color'],normal.inputs['Color']);nt.links.new(normal.outputs['Normal'],p.inputs['Normal'])
p.inputs['Sheen Weight'].default_value=.25
p.inputs['Sheen Tint'].default_value=(.15,.14,.13,1)
body.data.materials.clear();body.data.materials.append(skin)
fm,p=simple('XY_WEB_GROOM',(1,1,1,1))
attr=fm.node_tree.nodes.new('ShaderNodeVertexColor');attr.layer_name='Color'
fm.node_tree.links.new(attr.outputs['Color'],p.inputs['Base Color'])
webfur.data.materials.append(fm)
for o in objects:
    if o in [body,webfur]:continue
    name=o.name
    if 'EYE_GOLD' in name:
        m,p=simple('XY_WEB_EYE_'+name[-1],(.72,.51,.25,1),.5)
        p.inputs['Emission Color'].default_value=(.72,.51,.25,1);p.inputs['Emission Strength'].default_value=.22
    elif 'PUPIL' in name: m,p=simple('XY_WEB_PUPIL',(.004,.003,.002,1),.52)
    elif '唇缘' in name:m,p=simple('XY_WEB_LIP',(.045,.038,.03,1))
    else:m,p=simple('XY_WEB_SOCKET',(.009,.01,.012,1))
    o.data.materials.clear();o.data.materials.append(m)

for o in sc.objects: o.select_set(False)
for o in objects+motion_objects: o.select_set(True)
path=OUT/'xiaoying.glb'
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,use_active_scene=True,export_animations=False,export_apply=False,export_morph=True,export_morph_normal=False,export_morph_tangent=False,export_cameras=False,export_lights=False,export_extras=True)

# Append portable glTF channels using the original evaluated driver values.
raw=path.read_bytes();json_len=struct.unpack_from('<I',raw,12)[0]
doc=json.loads(raw[20:20+json_len]);binary=bytearray(raw[28+json_len:])
def accessor(values,kind):
    arr=np.asarray(values,dtype='<f4')
    while len(binary)%4:binary.append(0)
    offset=len(binary);data=arr.tobytes();binary.extend(data)
    view=len(doc.setdefault('bufferViews',[]));doc['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(data)})
    item={'bufferView':view,'componentType':5126,'count':len(arr),'type':kind}
    if kind=='SCALAR':item.update(min=[float(arr.min())],max=[float(arr.max())])
    idx=len(doc.setdefault('accessors',[]));doc['accessors'].append(item);return idx
nodes={n.get('name'):i for i,n in enumerate(doc['nodes'])}
doc['animations']=[]
for state in states:
    rows=samples[state['id']];anim={'name':state['id'],'channels':[],'samplers':[],'extras':{'loop':state['loop']}}
    times=accessor([r['time'] for r in rows],'SCALAR')
    def channel(name,prop,values,kind):
        if name not in nodes:raise RuntimeError('Missing exported node '+name)
        si=len(anim['samplers']);anim['samplers'].append({'input':times,'output':accessor(values,kind),'interpolation':'LINEAR'})
        anim['channels'].append({'sampler':si,'target':{'node':nodes[name],'path':prop}})
    for o in objects:channel(o.name,'weights',[v for r in rows for v in r['weights'][o.name]],'SCALAR')
    for o in motion_objects:
        for prop,kind in [('translation','VEC3'),('rotation','VEC4'),('scale','VEC3')]:channel(o.name,prop,[r['transforms'][o.name][prop] for r in rows],kind)
    doc['animations'].append(anim)
doc['buffers'][0]['byteLength']=len(binary)
encoded=json.dumps(doc,separators=(',',':'),ensure_ascii=True).encode()
encoded+=b' '*((-len(encoded))%4);binary+=b'\x00'*((-len(binary))%4)
path.write_bytes(struct.pack('<III',0x46546c67,2,12+8+len(encoded)+8+len(binary))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(binary),0x004e4942)+binary)
report={'source':bpy.data.filepath,'bytes':path.stat().st_size,'vertices':sum(len(o.data.vertices) for o in objects),'fur_strands':len(ids)//5,'animations':[s['id'] for s in states],'note':'Original morphs; sampled 15 fps; baked material; groom reduced to 1/20. Receive/Express props excluded from web trial.'}
(BASE/'web-export.json').write_text(json.dumps(report,indent=2,ensure_ascii=False))
print(json.dumps(report),flush=True)
