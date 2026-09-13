import bpy,math,random,numpy as np
from mathutils import Vector
sc=bpy.context.scene;body=bpy.data.objects['XY3_BODY • 一体影鳐'];root=bpy.data.objects['XY3_CTRL • 小影总控']
deform=bpy.app.driver_namespace['xy31_deform']
name='XY3_FUR / 贴伏短绒'
old=bpy.data.objects.get(name)
if old:
    data=old.data;bpy.data.objects.remove(old,do_unlink=True);bpy.data.meshes.remove(data)
me=bpy.data.meshes.new('XY31_NAP_SAMPLING')
me.from_pydata([v.co[:] for v in body.data.shape_keys.key_blocks['Basis'].data],[],[tuple(p.vertices) for p in body.data.polygons]);me.update()
a=me.attributes.new('XY_Belly','FLOAT','POINT');values=np.empty(len(a.data),dtype=np.float32);body.data.attributes['XY_Belly'].data.foreach_get('value',values);a.data.foreach_set('value',values)
tmp=bpy.data.objects.new('XY31_NAP_SAMPLING',me);sc.collection.objects.link(tmp);sub=tmp.modifiers.new('sample','SUBSURF');sub.levels=2
bpy.context.view_layer.update();ev=tmp.evaluated_get(bpy.context.evaluated_depsgraph_get());em=ev.to_mesh();em.calc_loop_triangles()
tris=list(em.loop_triangles);weights=[t.area for t in tris]
random.seed(3137);verts=[];faces=[];belly=[];shade=[]
for tr in random.choices(tris,weights=weights,k=105000):
    a,b,c=[em.vertices[i] for i in tr.vertices]
    r=math.sqrt(random.random());t=random.random();wa,wb,wc=1-r,r*(1-t),r*t
    p=a.co*wa+b.co*wb+c.co*wc
    if p.z<.105:continue
    if p.y<-.96 and abs(p.x)<.82 and .31<p.z<.86:continue
    norm=(a.normal*wa+b.normal*wb+c.normal*wc).normalized()
    direction=Vector((1,.18*math.sin(p.x*3+p.y*2),.08*math.cos(p.y*3)))
    tangent=(direction-norm*direction.dot(norm)).normalized();bitangent=norm.cross(tangent).normalized()
    length=random.uniform(.018,.045);width=random.uniform(.00065,.0011)
    height=random.uniform(.0008,.0024)
    base=len(verts);p=p+norm*.0006
    center=p+tangent*(length*.47)+norm*height
    tip=p+tangent*length+norm*(height*.65)
    verts.extend([p-bitangent*width*.45,p+bitangent*width*.45,center+bitangent*width,center-bitangent*width,tip])
    faces.extend([(base,base+1,base+2,base+3),(base+3,base+2,base+4)])
    v=sum(em.attributes['XY_Belly'].data[i].value*w for i,w in zip(tr.vertices,[wa,wb,wc]))
    belly.extend([v]*5);shade.extend([random.uniform(.68,1.22)]*5)
ev.to_mesh_clear();bpy.data.objects.remove(tmp,do_unlink=True);bpy.data.meshes.remove(me)
mesh=bpy.data.meshes.new('XY3 / 贴伏短绒纤维');mesh.from_pydata(verts,[],faces);mesh.update()
ob=bpy.data.objects.new(name,mesh);body.users_collection[0].objects.link(ob);ob.parent=root
ob['xy_version']='3.1';ob['strand_count']=len(verts)//5;ob['description']='Short fibers lie along the surface. Height 0.04–0.12 mm; no upright stubble.'
for p in mesh.polygons:p.use_smooth=True
for name,vals in [('XY_Belly',belly),('XY_FiberShade',shade)]:
    a=mesh.attributes.new(name,'FLOAT','POINT');a.data.foreach_set('value',np.array(vals,dtype=np.float32))
v=np.array(verts,dtype=np.float32)
a=mesh.attributes.new('XY_Rest','FLOAT_VECTOR','POINT');a.data.foreach_set('vector',v.ravel())
mat=bpy.data.materials.get('XY3_MAT / 贴伏短绒')
if mat:bpy.data.materials.remove(mat)
mat=body.data.materials[0].copy();mat.name='XY3_MAT / 贴伏短绒'
p=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED');nt=mat.node_tree
for link in list(nt.links):
    if link.to_node==p and link.to_socket.name=='Normal':nt.links.remove(link)
p.inputs['Sheen Weight'].default_value=.13;p.inputs['Specular IOR Level'].default_value=.23
attr=nt.nodes.new('ShaderNodeAttribute');attr.attribute_name='XY_FiberShade'
mix=nt.nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1
source=p.inputs['Base Color'].links[0].from_socket;nt.links.new(source,mix.inputs[1]);nt.links.new(attr.outputs['Fac'],mix.inputs[2]);nt.links.new(mix.outputs[0],p.inputs['Base Color'])
mesh.materials.append(mat);ob.shape_key_add(name='Basis')
for prop in ['Breath','Wing_L','Wing_R','Receive','Rest','Tail_Sway','Squash']:
    key=ob.shape_key_add(name=prop);key.slider_min=-1 if prop=='Tail_Sway' else (-.15 if prop.startswith('Wing_') else 0)
    co=np.array([deform(c,prop) for c in verts],dtype=np.float32);key.data.foreach_set('co',co.ravel())
    d=key.driver_add('value').driver;var=d.variables.new();var.name='v';var.type='SINGLE_PROP';var.targets[0].id=root;var.targets[0].data_path='["'+prop+'"]';d.expression='v'
sc.frame_set(167);bpy.context.view_layer.update()
result={'fibers':ob['strand_count'],'vertices':len(mesh.vertices)}
