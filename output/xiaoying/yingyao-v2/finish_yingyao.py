import bpy,math,json,os,bmesh
from math import exp,sqrt,sin,cos,pi
from mathutils import Vector
OUT='/Users/happy/Desktop/AdgaiWalker/output/xiaoying/yingyao-v2'
scene=bpy.context.scene;rig=bpy.data.objects['YY_RIG'];body=bpy.data.objects['YY_Continuous_Body'];scene.frame_set(1)

# Read and reuse the authored surface functions, without rerunning scene creation.
import ast
source=open(OUT+'/build_yingyao.py',encoding='utf-8').read();tree=ast.parse(source)
for n in tree.body:
    if isinstance(n,ast.FunctionDef) and n.name in ['smooth','perimeter','params','heights','deform']:
        exec(compile(ast.Module(body=[n],type_ignores=[]),'<surface-functions>','exec'))

# Tune expression to the selected concept: narrow luminous almonds, small pupils.
for o in bpy.data.collections['V2_02_Expression'].objects:
    if o.name.startswith(('YY_LightEye','YY_Pupil')):
        basis=o.data.shape_keys.key_blocks['Basis'];is_pupil='Pupil' in o.name
        cx=(-.31 if o.name.endswith('.R') else .31)+(.042 if is_pupil else 0)
        cy=-.931 if is_pupil else -.925;depth=.029 if is_pupil else .018
        for v in basis.data:
            v.co.x=cx+(v.co.x-cx)*1.10
            v.co.y=cy+(v.co.y-cy)*.42
            v.co.z=heights(v.co.x,v.co.y)[0]+depth
        for c in ['Cradle','Spread','PeekR','PeekL','Breathe']:
            key=o.data.shape_keys.key_blocks[c]
            for a,b in zip(basis.data,key.data):b.co=deform(a.co,c)
        key=o.data.shape_keys.key_blocks['Blink']
        for a,b in zip(basis.data,key.data):
            b.co=a.co.copy();b.co.y=cy+(b.co.y-cy)*.015;b.co.z=heights(b.co.x,b.co.y)[0]+depth

m=bpy.data.materials['V2_Graphite_Ink'];p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
p.inputs['Base Color'].default_value=(.013,.011,.010,1);m.diffuse_color=(.013,.011,.010,1)
p.inputs['Roughness'].default_value=.80;p.inputs['Specular IOR Level'].default_value=.18;p.inputs['Sheen Weight'].default_value=.055
for n in m.node_tree.nodes:
    if n.type=='BUMP':n.inputs['Strength'].default_value=.085;n.inputs['Distance'].default_value=.007

# Structural checks and sampled NLA/driver evaluation.
bm=bmesh.new();bm.from_mesh(body.data)
audit={'body_vertices':len(bm.verts),'body_faces':len(bm.faces),'boundary_edges':sum(e.is_boundary for e in bm.edges),'nonmanifold_edges':sum(not e.is_manifold for e in bm.edges),'bones':len(rig.pose.bones)};bm.free()
states=json.load(open(OUT+'/animation-states.json',encoding='utf-8'))
audit['actions']=len(states);audit['samples']=[]
for f in [1,67,132,239,348,451,550,650,696]:
    scene.frame_set(f);bpy.context.view_layer.update()
    dep=bpy.context.evaluated_depsgraph_get();ob=body.evaluated_get(dep);me=ob.to_mesh()
    coords=[ob.matrix_world@v.co for v in me.vertices]
    audit['samples'].append({'frame':f,'blink':float(rig['Blink']),'cradle':float(rig['Cradle']),'spread':float(rig['Spread']),'z_min':min(v.z for v in coords),'finite':all(math.isfinite(c) for v in coords for c in v)})
    ob.to_mesh_clear()
audit['loop_endpoint_errors']={}
for state in states:
    snapshots=[]
    for f in [state['start'],state['end']]:
        scene.frame_set(f);bpy.context.view_layer.update()
        vals=[float(rig[k]) for k in ['Cradle','Spread','PeekR','PeekL','Breathe','Blink']]
        for pb in rig.pose.bones:vals+=list(pb.location)+list(pb.rotation_euler)+list(pb.scale)
        snapshots.append(vals)
    audit['loop_endpoint_errors'][state['state']]=max(abs(a-b) for a,b in zip(*snapshots))
scene.frame_set(1)
with open(OUT+'/validation.json','w',encoding='utf-8') as f:json.dump(audit,f,ensure_ascii=False,indent=2)

scene.render.resolution_percentage=100;scene.cycles.samples=48
scene.render.engine='CYCLES';scene.render.image_settings.file_format='PNG';scene.render.fps=24;scene.frame_step=1
bpy.ops.wm.save_as_mainfile(filepath=OUT+'/xiaoying-yingyao-v2.blend')
jobs=[(1,'YY_CAM_Hero','yingyao-hero.png',100),(451,'YY_CAM_Hero','yingyao-working.png',65),(67,'YY_CAM_Hero','yingyao-blink.png',50)]
def render_next():
    if not jobs:
        scene.frame_set(1);scene.camera=bpy.data.objects['YY_CAM_Hero'];scene.render.resolution_percentage=100
        scene.render.filepath=OUT+'/yingyao-hero.png'
        bpy.ops.wm.save_as_mainfile(filepath=OUT+'/xiaoying-yingyao-v2.blend')
        return None
    frame,cam,name,size=jobs.pop(0);scene.frame_set(frame);scene.camera=bpy.data.objects[cam];scene.render.resolution_percentage=size;scene.render.filepath=OUT+'/'+name
    bpy.ops.render.render(write_still=True)
    return .25
bpy.app.timers.register(render_next,first_interval=.3)
result={'audit':audit,'render_jobs':3}
