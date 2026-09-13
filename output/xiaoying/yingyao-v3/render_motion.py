import bpy,json,time,os,traceback
from pathlib import Path
OUT=Path('/Users/happy/Desktop/AdgaiWalker/output/xiaoying/yingyao-v3')
sc=bpy.context.scene
def status(**values):
    (OUT/'render-progress.json').write_text(json.dumps(values,ensure_ascii=False))
try:
    validation={'scenes':[s.name for s in bpy.data.scenes],'objects':len(sc.objects),'actions':len([a for a in bpy.data.actions if a.name.startswith('XY3 / ')]),'reference_packed':bpy.data.images['XY3 / 用户参考 · 影鳐'].packed_file is not None}
    (OUT/'validation-reopen.json').write_text(json.dumps(validation,ensure_ascii=False,indent=2))
    sc.render.engine='BLENDER_EEVEE'
    sc.eevee.taa_render_samples=16
    sc.eevee.use_fast_gi=True
    sc.render.resolution_x=720;sc.render.resolution_y=540;sc.render.resolution_percentage=100
    bpy.data.objects['XY3_FUR • 短绒细节'].hide_render=True
    sc.camera=bpy.data.objects['XY3_CAM / 01 Hero'];sc.frame_set(167)
    sc.render.image_settings.media_type='IMAGE';sc.render.image_settings.file_format='PNG'
    sc.render.filepath=str(OUT/'video-check.png')
    start=time.monotonic();bpy.ops.render.render(write_still=True)
    status(phase='benchmark_done',seconds=time.monotonic()-start)
    def choose_camera(scene,*args):
        f=scene.frame_current
        name='XY3_CAM / 05 Interaction' if 376<=f<=540 else ('XY3_CAM / 06 Expression' if 676<=f<=810 else 'XY3_CAM / 01 Hero')
        scene.camera=bpy.data.objects[name]
    bpy.app.handlers.frame_change_pre.append(choose_camera)
    def progress(scene,*args):
        if scene.frame_current%20 in [1,2]:
            status(phase='rendering',frame=scene.frame_current,last=1095,elapsed=time.monotonic()-start)
    bpy.app.handlers.render_write.append(progress)
    sc.render.fps=15;sc.frame_step=2;sc.frame_start=1;sc.frame_end=1095
    sc.render.image_settings.media_type='VIDEO';sc.render.image_settings.file_format='FFMPEG'
    sc.render.ffmpeg.format='MPEG4';sc.render.ffmpeg.codec='H264'
    sc.render.ffmpeg.constant_rate_factor='MEDIUM';sc.render.ffmpeg.ffmpeg_preset='GOOD'
    sc.render.ffmpeg.audio_codec='NONE'
    sc.render.filepath=str(OUT/'xiaoying-motion-preview.mp4')
    bpy.ops.render.render(animation=True)
    status(phase='complete',elapsed=time.monotonic()-start,output=str(OUT/'xiaoying-motion-preview.mp4'))
except Exception:
    status(phase='error',error=traceback.format_exc())
    raise
