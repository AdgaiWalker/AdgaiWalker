import bpy,ast,math,json,os,bmesh
from math import exp,sqrt,sin,cos,pi
from mathutils import Vector
OUT='/Users/happy/Desktop/AdgaiWalker/output/xiaoying/yingyao-v2'
scene=bpy.context.scene;rig=bpy.data.objects['YY_RIG'];body=bpy.data.objects['YY_Continuous_Body'];scene.frame_set(1)
tree=ast.parse(open(OUT+'/build_yingyao.py',encoding='utf-8').read())
for n in tree.body:
    if isinstance(n,ast.FunctionDef) and n.name in ['smooth','perimeter','params','heights','deform']:exec(compile(ast.Module(body=[n],type_ignores=[]),'<surface>','exec'))
for o in [body]+list(bpy.data.collections['V2_02_Expression'].objects):
    if o.type!='MESH' or not o.data.shape_keys:continue
    basis=o.data.shape_keys.key_blocks['Basis']
    for c in ['Cradle','Spread','PeekR','PeekL','Breathe']:
        for a,b in zip(basis.data,o.data.shape_keys.key_blocks[c].data):b.co=deform(a.co,c)
scene.frame_set(1);bpy.context.view_layer.update()
source=open(OUT+'/finish_yingyao.py',encoding='utf-8').read()
exec(compile(source[source.index('# Structural checks'):],'<validation-render>','exec'))
