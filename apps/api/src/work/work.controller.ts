import { Body, Controller, Get, Inject, Param, Post, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { validateOriginalUpload } from '@walker/shared';
import { validationError } from '../common/http-error';
import { type OriginalFileInput } from '../ports/artifact.repository';
import { WorkService } from './work.service';
import { WORK_UPLOAD_OPTIONS } from './work-upload.config';

type UploadedOriginal = { originalname: string; mimetype: string; size: number; buffer: Buffer };

@Controller('works')
export class WorkController {
  constructor(@Inject(WorkService) private readonly works: WorkService) {}

  @Get()
  list() { return this.works.list(); }

  @Get(':id')
  get(@Param('id') id: string) { return this.works.get(id); }

  @Post()
  @UseInterceptors(FileFieldsInterceptor([
    { name: 'draft', maxCount: 1 },
    { name: 'attachments', maxCount: 20 },
  ], WORK_UPLOAD_OPTIONS))
  create(
    @Body() body: Record<string, string | undefined>,
    @UploadedFiles() files: { draft?: UploadedOriginal[]; attachments?: UploadedOriginal[] },
  ) {
    const draft = files?.draft?.[0];
    const attachments = files?.attachments ?? [];
    if (!draft) throw validationError('one-draft-required');
    try { validateOriginalUpload({ title: body.title ?? '', coreViewpoint: body.coreViewpoint ?? '', draftCount: 1, attachmentCount: attachments.length }); }
    catch (error) { throw validationError(error instanceof Error ? error.message : 'invalid-original-upload'); }
    const toInput = (file: UploadedOriginal): OriginalFileInput => ({ originalName: file.originalname, mimeType: file.mimetype, size: file.size, bytes: file.buffer, role: 'attachment' });
    return this.works.create({
      idempotencyKey: body.idempotencyKey,
      executionId: body.executionId,
      title: body.title,
      sourceProblem: body.sourceProblem,
      whyNow: body.whyNow,
      contentBriefRaw: body.contentBrief,
      coreViewpoint: body.coreViewpoint,
      protectedClaimsRaw: body.protectedClaims,
    }, { ...toInput(draft), role: 'draft' }, attachments.map(toInput));
  }
}
