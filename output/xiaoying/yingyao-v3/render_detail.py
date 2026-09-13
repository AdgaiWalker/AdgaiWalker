import bpy
from pathlib import Path
OUT=Path('/Users/happy/Desktop/AdgaiWalker/output/xiaoying/yingyao-v3')
sc=bpy.context.scene
# A dedicated still uses its own camera, independent of timeline camera markers.
for marker in sc.timeline_markers:
    marker.camera=None
sc.frame_set(167)
sc.camera=bpy.data.objects['XY3_CAM / 04 Face']
sc.render.engine='CYCLES'
sc.cycles.samples=96
sc.cycles.use_denoising=True
sc.render.resolution_x=1400
sc.render.resolution_y=1050
sc.render.resolution_percentage=100
sc.render.image_settings.media_type='IMAGE'
sc.render.image_settings.file_format='PNG'
sc.render.filepath=str(OUT/'09-material-detail.png')
bpy.ops.render.render(write_still=True)
