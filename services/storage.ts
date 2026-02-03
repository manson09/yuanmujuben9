import { Project } from '../types';

const STORAGE_KEY = 'AI_CREATIVE_AGENT_PROJECTS';

export const storage = {
  // --- 原有本地逻辑（保持不变） ---
  getProjects: (): Project[] => {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  },
  saveProjects: (projects: Project[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  },
  getProject: (id: string): Project | undefined => {
    const projects = storage.getProjects();
    return projects.find(p => p.id === id);
  },
  updateProject: (project: Project) => {
    const projects = storage.getProjects();
    const index = projects.findIndex(p => p.id === project.id);
    if (index !== -1) {
      projects[index] = { ...project, updatedAt: Date.now() };
    } else {
      projects.push(project);
    }
    storage.saveProjects(projects);
  },

  // --- 新增云端同步逻辑（对接你的 Cloudflare KV） ---
  
  // 将所有项目同步到云端
  saveToCloud: async (projects: Project[]) => {
    try {
      await fetch('/api/save', { // 对应你 functions/api/save.js
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: STORAGE_KEY, data: projects }),
      });
      console.log('☁️ 项目列表已同步至云端');
    } catch (e) {
      console.error('云端保存失败:', e);
    }
  },

  // 从云端拉取项目列表
  loadFromCloud: async (): Promise<Project[] | null> => {
    try {
      const response = await fetch(`/api/get-shots?id=${STORAGE_KEY}`); // 对应你 functions/api/get-shots.js
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        // 同步到本地，保证下次读取更快
        storage.saveProjects(data);
        return data;
      }
      return null;
    } catch (e) {
      console.error('从云端加载失败:', e);
      return null;
    }
  }
};
