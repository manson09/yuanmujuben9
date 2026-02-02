
export type Category = '原著小说' | '排版参考' | '文笔参考';
export type Mode = '男频' | '女频';
export type ScriptStyle = '情绪流' | '非情绪流';

export interface ProjectFile {
  id: string;
  name: string;
  category: Category;
  content: string; 
  size: string;
}

export interface CharacterBio {
  name: string;
  gender: string;
  age: string;
  identity: string;
  appearance: string;
  growth: string;
  motivation: string;
}

export interface PhasePlan {
  phaseIndex: number;
  episodes: number;
  description: string;
  climax: string;
}

export interface ProjectOutline {
  content: string;
  characters: CharacterBio[];
  phasePlans: PhasePlan[];
}

export interface Episode {
  episodeNumber: number;
  title: string;
  content: string;
}

export interface FullScript {
  episodes: Episode[];
  generatedAt: number;
  style: ScriptStyle;
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  files: ProjectFile[];
  mode: Mode;
  scriptStyle: ScriptStyle;
  outline?: ProjectOutline;
  fullScript?: FullScript;
}

export type ViewState = 'MANAGEMENT' | 'KNOWLEDGE_BASE' | 'OUTLINE' | 'SCRIPT';
