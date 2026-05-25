import type { Direction, MachineType } from './types.ts'

export interface LevelGoal {
  readonly type: 'produce_robots' | 'produce_parts' | 'quality_target' | 'time_limit'
  readonly target: number
  readonly itemType?: string
}

export interface LevelStartingMachine {
  readonly x: number
  readonly z: number
  readonly type: MachineType
  readonly rotation: Direction
  readonly name?: string
}

export interface LevelDefinition {
  readonly id: string
  readonly nameKey: string
  readonly descriptionKey: string
  readonly gridSize: { width: number; height: number }
  readonly availableMachines: MachineType[]
  readonly unlockedBlocks: number
  readonly goals: LevelGoal[]
  readonly parScores: { speed: number; cost: number; quality: number }
  readonly startingMachines?: ReadonlyArray<LevelStartingMachine>
}

const levels: LevelDefinition[] = [
  {
    id: 'level_1',
    nameKey: 'levels.level_1.name',
    descriptionKey: 'levels.level_1.description',
    gridSize: { width: 10, height: 10 },
    availableMachines: ['part_fabricator', 'assembler', 'factory_output'],
    unlockedBlocks: 1,
    goals: [
      { type: 'produce_parts', target: 3, itemType: 'wheel_small' },
    ],
    parScores: { speed: 1, cost: 10, quality: 80 },
    startingMachines: [
      { x: 8, z: 5, type: 'factory_output', rotation: 'west' },
    ],
  },
  {
    id: 'level_2',
    nameKey: 'levels.level_2.name',
    descriptionKey: 'levels.level_2.description',
    gridSize: { width: 12, height: 12 },
    availableMachines: ['part_fabricator', 'assembler', 'factory_output'],
    unlockedBlocks: 1,
    goals: [
      { type: 'produce_robots', target: 3, itemType: 'robot_explorer' },
    ],
    parScores: { speed: 2, cost: 15, quality: 80 },
  },
  {
    id: 'level_3',
    nameKey: 'levels.level_3.name',
    descriptionKey: 'levels.level_3.description',
    gridSize: { width: 14, height: 14 },
    availableMachines: ['part_fabricator', 'assembler', 'factory_output'],
    unlockedBlocks: 2,
    goals: [
      { type: 'produce_parts', target: 10, itemType: 'wheel_small' },
    ],
    parScores: { speed: 5, cost: 12, quality: 70 },
  },
  {
    id: 'level_4',
    nameKey: 'levels.level_4.name',
    descriptionKey: 'levels.level_4.description',
    gridSize: { width: 14, height: 14 },
    availableMachines: ['part_fabricator', 'assembler', 'splitter', 'recycler', 'factory_output'],
    unlockedBlocks: 3,
    goals: [
      { type: 'produce_robots', target: 5, itemType: 'robot_explorer' },
      { type: 'quality_target', target: 80 },
    ],
    parScores: { speed: 3, cost: 20, quality: 85 },
  },
  {
    id: 'level_5',
    nameKey: 'levels.level_5.name',
    descriptionKey: 'levels.level_5.description',
    gridSize: { width: 16, height: 16 },
    availableMachines: ['part_fabricator', 'assembler', 'splitter', 'factory_output'],
    unlockedBlocks: 4,
    goals: [
      { type: 'produce_robots', target: 3, itemType: 'robot_explorer' },
      { type: 'produce_robots', target: 3, itemType: 'robot_worker' },
    ],
    parScores: { speed: 3, cost: 25, quality: 75 },
  },
  {
    id: 'level_6',
    nameKey: 'levels.level_6.name',
    descriptionKey: 'levels.level_6.description',
    gridSize: { width: 16, height: 16 },
    availableMachines: ['part_fabricator', 'assembler', 'splitter', 'factory_output'],
    unlockedBlocks: 5,
    goals: [
      { type: 'produce_robots', target: 2, itemType: 'robot_explorer' },
      { type: 'produce_robots', target: 4, itemType: 'robot_worker' },
    ],
    parScores: { speed: 3, cost: 30, quality: 80 },
  },
  {
    id: 'level_7',
    nameKey: 'levels.level_7.name',
    descriptionKey: 'levels.level_7.description',
    gridSize: { width: 18, height: 18 },
    availableMachines: ['part_fabricator', 'assembler', 'splitter', 'painter', 'factory_output'],
    unlockedBlocks: 6,
    goals: [
      { type: 'produce_robots', target: 10, itemType: 'robot_worker' },
      { type: 'time_limit', target: 3000 },
    ],
    parScores: { speed: 5, cost: 25, quality: 70 },
  },
  {
    id: 'level_8',
    nameKey: 'levels.level_8.name',
    descriptionKey: 'levels.level_8.description',
    gridSize: { width: 20, height: 20 },
    availableMachines: ['part_fabricator', 'assembler', 'painter', 'recycler', 'splitter', 'factory_output'],
    unlockedBlocks: 7,
    goals: [
      { type: 'produce_robots', target: 10, itemType: 'robot_explorer' },
      { type: 'quality_target', target: 90 },
    ],
    parScores: { speed: 5, cost: 20, quality: 90 },
  },
  {
    id: 'level_9',
    nameKey: 'levels.level_9.name',
    descriptionKey: 'levels.level_9.description',
    gridSize: { width: 20, height: 20 },
    availableMachines: ['part_fabricator', 'assembler', 'painter', 'recycler', 'splitter', 'factory_output'],
    unlockedBlocks: 7,
    goals: [],
    parScores: { speed: 1, cost: 50, quality: 50 },
  },
  {
    id: 'level_10',
    nameKey: 'levels.level_10.name',
    descriptionKey: 'levels.level_10.description',
    gridSize: { width: 20, height: 20 },
    availableMachines: ['part_fabricator', 'assembler', 'painter', 'recycler', 'splitter', 'factory_output'],
    unlockedBlocks: 7,
    goals: [
      { type: 'produce_robots', target: 5, itemType: 'robot_explorer' },
      { type: 'produce_robots', target: 10, itemType: 'robot_worker' },
      { type: 'quality_target', target: 85 },
    ],
    parScores: { speed: 6, cost: 35, quality: 85 },
  },
]

const levelMap = new Map<string, LevelDefinition>(
  levels.map((l) => [l.id, l]),
)

export function getLevelById(id: string): LevelDefinition | undefined {
  return levelMap.get(id)
}

export function getAllLevels(): ReadonlyArray<LevelDefinition> {
  return levels
}

export function getLevelByNumber(num: number): LevelDefinition | undefined {
  if (num < 1 || num > levels.length) return undefined
  return levels[num - 1]
}
