import bpy,os,time,json,shutil,traceback
from pathlib import Path
OUT=Path('/Users/happy/Desktop/AdgaiWalker/output/xiaoying/yingyao-v3')
sc=bpy.context.scene;start=time.monotonic()
def status(**v):
    v['elapsed']=round(time.monotonic()-start,2);(OUT/'lookdev-progress.json').write_text(json.dumps(v,ensure_ascii=False))
try:
    report=json.loads((OUT/'validation-lookdev.json').read_text())
    report['reopened_asset']={'scenes':[s.name for s in bpy.data.scenes],'objects':len(sc.objects),'actions':len([a for a in bpy.data.actions if a.name.startswith('XY3 / ')]),'rest_attribute_present':'XY_Rest' in bpy.data.objects['XY3_BODY • 一体影鳐'].data.attributes}
    (OUT/'validation-lookdev.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    shutil.copy2(OUT/'01-hero.png',OUT/'02-hello.png')
    sc.render.resolution_x=1100;sc.render.resolution_y=825;sc.render.resolution_percentage=100
    sc.render.engine='CYCLES';sc.cycles.samples=48;sc.cycles.use_denoising=True
    sc.render.image_settings.media_type='IMAGE';sc.render.image_settings.file_format='PNG'
    shots=[(1006,'08-sleep','01 Hero'),(450,'04-receive','05 Interaction'),(167,'09-material-detail','04 Face'),(31,'01-idle','01 Hero'),(271,'03-listen','01 Hero'),(568,'05-think','01 Hero'),(735,'06-express','06 Expression'),(839,'07-joy','01 Hero')]
    marker_cameras=[(m,m.camera) for m in sc.timeline_markers if m.camera]
    for marker,camera in marker_cameras:marker.camera=None
    for i,(frame,name,camera) in enumerate(shots):
        status(phase='stills',shot=i+1,total=len(shots),name=name)
        sc.frame_set(frame);sc.camera=bpy.data.objects['XY3_CAM / '+camera];sc.render.filepath=str(OUT/(name+'.png'))
        bpy.ops.render.render(write_still=True)
    for marker,camera in marker_cameras:marker.camera=camera
    sc.render.engine='BLENDER_EEVEE';sc.eevee.taa_render_samples=24;sc.eevee.use_fast_gi=True
    sc.render.resolution_x=720;sc.render.resolution_y=540
    for ob in sc.objects:
        if ob.name.startswith('XY3_FUR'):ob.hide_render=True
    sc.frame_set(167);sc.camera=bpy.data.objects['XY3_CAM / 01 Hero'];sc.render.filepath=str(OUT/'video-lookdev-check.png')
    bpy.ops.render.render(write_still=True)
    def choose_camera(scene,*args):
        f=scene.frame_current
        name='XY3_CAM / 05 Interaction' if 376<=f<=540 else ('XY3_CAM / 06 Expression' if 676<=f<=810 else 'XY3_CAM / 01 Hero')
        scene.camera=bpy.data.objects[name]
    bpy.app.handlers.frame_change_pre.append(choose_camera)
    def progress(scene,*args):
        if scene.frame_current%20 in [1,2]:status(phase='motion',frame=scene.frame_current,last=1095)
    bpy.app.handlers.render_write.append(progress)
    sc.render.fps=15;sc.frame_step=2;sc.frame_start=1;sc.frame_end=1095
    sc.render.image_settings.media_type='VIDEO';sc.render.image_settings.file_format='FFMPEG'
    sc.render.ffmpeg.format='MPEG4';sc.render.ffmpeg.codec='H264';sc.render.ffmpeg.constant_rate_factor='MEDIUM';sc.render.ffmpeg.ffmpeg_preset='GOOD';sc.render.ffmpeg.audio_codec='NONE'
    sc.render.filepath=str(OUT/'xiaoying-motion-preview.mp4')
    bpy.ops.render.render(animation=True)
    status(phase='complete')
except Exception:
    status(phase='error',error=traceback.format_exc());raise
