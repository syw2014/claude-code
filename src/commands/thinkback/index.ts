import type { Command } from '../../commands.js'
const thinkback = {
  type: 'local-jsx',
  name: 'think-back',
  description: 'Experimental: your Claude Code Year in Review',
  load: () => import('./thinkback.js'),
} satisfies Command

export default thinkback
