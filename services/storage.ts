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

  // --- 修改后的同步逻辑：移除 fetch，改为操作本地 ---
  
  // 将所有项目保存到本地（原云端同步逻辑）
  saveToCloud: async (projects: Project[]) => {
    try {
      storage.saveProjects(projects);
      console.log('💾 数据已保存至本地');
    } catch (e) {
      console.error('保存失败:', e);
    }
  },

  // 从本地拉取项目列表（原云端拉取逻辑）
  loadFromCloud: async (): Promise<Project[] | null> => {
    try {
      const data = storage.getProjects();
      if (Array.isArray(data) && data.length > 0) {
        return data;
      }
      return null;
    } catch (e) {
      console.error('加载失败:', e);
      return null;
    }
  }
};
