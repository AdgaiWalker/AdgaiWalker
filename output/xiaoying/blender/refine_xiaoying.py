import bpy, math, json
from mathutils import Vector
from math import pi,sin,cos
scene=bpy.context.scene;scene.frame_set(1)
rig=bpy.data.objects['XY_RIG']
# Refine material response: keep the dark body readable without a gray plastic sheen.
m=bpy.data.materials['XY_Ink_Velvet'];p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
p.inputs['Base Color'].default_value=(.013,.0115,.011,1)
p.inputs['Roughness'].default_value=.78
p.inputs['Specular IOR Level'].default_value=.23
p.inputs['Sheen Weight'].default_value=.10
m.diffuse_color=(.013,.0115,.011,1)
p2=next(n for n in bpy.data.materials['XY_Ear_Inner'].node_tree.nodes if n.type=='BSDF_PRINCIPLED')
p2.inputs['Base Color'].default_value=(.022,.018,.017,1)
p2.inputs['Sheen Weight'].default_value=.06
for side,x in [('R',-.38),('L',.38)]:
    ob=bpy.data.objects['XY_Paw.'+side]
    for v in ob.data.vertices:
        v.co.z=1.03+(v.co.z-1.03)*.83
        v.co.x=x+(v.co.x-x)*.9
        v.co.y=-.375+(v.co.y+.375)*.91+.032

def cat(vals,t):
    n=len(vals);v=t*(n-1);i=min(int(v),n-2);u=v-i
    a=vals[max(i-1,0)];b=vals[i];c=vals[i+1];d=vals[min(i+2,n-1)]
    return tuple(.5*(2*b[k]+(-a[k]+c[k])*u+(2*a[k]-5*b[k]+4*c[k]-d[k])*u*u+(-a[k]+3*b[k]-3*c[k]+d[k])*u*u*u) for k in range(len(b)))

# Rotation-minimizing frames avoid orientation discontinuities around curled tips.
def replace_surface(name,sections,rings,sides,tail=False):
    ob=bpy.data.objects[name]; verts=[];faces=[]
    previous_width=None
    for i in range(rings+1):
        t=i/rings;q=cat(sections,t)
        a=cat(sections,max(0,t-.002));b=cat(sections,min(1,t+.002))
        tangent=(Vector(b[:3])-Vector(a[:3])).normalized()
        if previous_width is None:width=Vector((0,1,0)).cross(tangent).normalized()
        else:width=(previous_width-tangent*previous_width.dot(tangent)).normalized()
        depth=tangent.cross(width).normalized();previous_width=width
        for j in range(sides):
            ang=2*pi*j/sides
            v=Vector(q[:3])+width*cos(ang)*max(.002,q[3])+depth*sin(ang)*max(.002,q[4])
            verts.append(v)
    for i in range(rings):
        for j in range(sides):
            a=i*sides+j;b=i*sides+(j+1)%sides;faces.append((a,b,b+sides,a+sides))
    faces.append(tuple(range(sides-1,-1,-1)))
    faces.append(tuple(rings*sides+j for j in range(sides)))
    assert len(verts)==len(ob.data.vertices)
    for v,p in zip(ob.data.vertices,verts):v.co=p
    ob.data.update()

tail_sections=[(0,.36,.59,.20,.15),(.34,.64,.57,.19,.125),(.83,.88,.66,.20,.10),(1.35,1.02,.97,.235,.085),(1.73,1.04,1.43,.27,.08),(2.02,1.03,1.67,.205,.065),(2.24,1.02,1.72,.007,.007)]
replace_surface('XY_Shadow_Ribbon_Tail',tail_sections,72,24,True)
ear_l=[(.52,.01,2.55,.27,.155),(.65,.005,2.77,.22,.125),(.86,-.005,2.78,.15,.095),(1.005,-.055,2.62,.065,.045),(1.015,-.08,2.51,.005,.005)]
replace_surface('XY_Ear_Folded.L',ear_l,40,20)
# Inner fold terminates before the outer tip.
inner_l=[(.58,-.14,2.62,.10,.008),(.70,-.125,2.73,.10,.008),(.84,-.102,2.72,.05,.007),(.91,-.10,2.66,.004,.004)]
replace_surface('XY_Ear_Inner.L',inner_l,24,16)

# Keep the blink property floating-point for animation evaluation.
rig['blink']=0.0
scene.frame_set(1);bpy.context.view_layer.update()
scene.render.resolution_percentage=60;scene.cycles.samples=24
scene.render.filepath='/Users/happy/Desktop/AdgaiWalker/output/xiaoying/blender/preview-refined.png'
def render_preview():
    bpy.ops.render.render(write_still=True)
    return None
bpy.app.timers.register(render_preview,first_interval=.3)
result={'refined':['ink material','paws','tail parallel transport','folded ear'],'render':scene.render.filepath}
