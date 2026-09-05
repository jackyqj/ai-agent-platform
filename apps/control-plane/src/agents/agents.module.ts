import { Module } from '@nestjs/common'
import { AgentsService } from './agents.service.js'
import { AgentsController } from './agents.controller.js'
import { AgentComposer } from './composer.js'
import { DEFAULT_CATALOG } from './catalog.js'
import { DiskPresetFileStore, PRESET_FILE_STORE } from './preset-file-store.js'
import { SkillsModule } from '../skills/skills.module.js'

const DEFAULT_PRESET_ROOT = '/Users/jac/sw_dir/ai-agent-platform/.dsh-home/presets-company'

@Module({
  imports: [SkillsModule],
  providers: [
    AgentsService,
    { provide: AgentComposer, useFactory: () => new AgentComposer(DEFAULT_CATALOG) },
    { provide: PRESET_FILE_STORE, useFactory: () => new DiskPresetFileStore(process.env.CP_PRESET_ROOT ?? DEFAULT_PRESET_ROOT) },
  ],
  controllers: [AgentsController],
  exports: [AgentsService],
})
export class AgentsModule {}
