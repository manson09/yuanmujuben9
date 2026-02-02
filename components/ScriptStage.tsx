
import React, { useState, useEffect } from 'react';
import { Project, Mode, ScriptStyle, Episode, PhasePlan } from '../types';
import { geminiService } from '../services/geminiService';

interface Props {
  project: Project;
  onUpdate: (project: Project) => void;
  onBack: () => void;
}

const ScriptStage: React.FC<Props> = ({ project, onUpdate, onBack }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentProcessingPhase, setCurrentProcessingPhase] = useState<PhasePlan | null>(null);
  const [localMode, setLocalMode] = useState<Mode>(project.mode);
  const [localStyle, setLocalStyle] = useState<ScriptStyle>(project.scriptStyle || '情绪流');
  
  const [selectedNovelId, setSelectedNovelId] = useState<string>(project.files.find(f => f.category === '原著小说')?.id || '');
  const [selectedLayoutId, setSelectedLayoutId] = useState<string>(project.files.find(f => f.category === '排版参考')?.id || '');

  const novelFiles = project.files.filter(f => f.category === '原著小说');
  const layoutFiles = project.files.filter(f => f.category === '排版参考');

  const runAutoGeneration = async () => {
    const novel = novelFiles.find(f => f.id === selectedNovelId);
    if (!novel) return alert("请先选择原著小说文件");
    if (!project.outline) return alert("请先生成大纲");

    setIsGenerating(true);
    let allEpisodes: Episode[] = [];
    let lastEpisodeContext = "";

    try {
      const phases = project.outline.phasePlans;
      const layoutRef = layoutFiles.find(f => f.id === selectedLayoutId)?.content || "";

      for (let i = 0; i < phases.length; i++) {
        const phase = phases[i];
        setCurrentProcessingPhase(phase); // 记录当前正在执行的大纲阶段
        
        const startEpNum = allEpisodes.length + 1;
        
        const result = await geminiService.generateScriptBatch(
          novel.content,
          project.outline.content,
          phase,
          startEpNum,
          lastEpisodeContext,
          localMode,
          localStyle,
          layoutRef
        );

        const batchEps: Episode[] = result.episodes.map((ep: any, idx: number) => ({
          ...ep,
          episodeNumber: startEpNum + idx
        }));
        
        allEpisodes = [...allEpisodes, ...batchEps];
        
        const lastEp = batchEps[batchEps.length - 1];
        lastEpisodeContext = `【第${lastEp.episodeNumber}集 结尾内容参考】\n标题：${lastEp.title}\n内容：${lastEp.content.slice(-500)}`;

        onUpdate({ 
          ...project, 
          fullScript: {
            episodes: [...allEpisodes],
            generatedAt: Date.now(),
            style: localStyle
          },
          mode: localMode, 
          scriptStyle: localStyle 
        });
      }
    } catch (error) {
      console.error(error);
      alert("全集生成过程中断。已保存已生成的章节。");
    } finally {
      setIsGenerating(false);
      setCurrentProcessingPhase(null);
    }
  };

  const downloadFullScript = () => {
    if (!project.fullScript) return;
    const title = `${project.name}_全集剧本.docx`;
    const header = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><style>body{font-family: 'SimSun', serif; padding: 40px;} .episode{margin-bottom: 60px; border-bottom: 1px solid #eee; padding-bottom: 40px;} .ep-title{font-weight: bold; font-size: 16pt; color: #1a56db; margin-bottom: 15px;} .content{font-size: 11pt; line-height: 2; color: #333; white-space: pre-wrap;}</style></head><body>`;
    let body = `<h1>${project.name} - 全集剧本 (${project.fullScript.style})</h1>`;
    project.fullScript.episodes.forEach(ep => { 
      body += `<div class="episode"><div class="ep-title">第 ${ep.episodeNumber} 集：${ep.title}</div><div class="content">${ep.content}</div></div>`; 
    });
    const blob = new Blob([header + body + "</body></html>"], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = title; link.click();
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-32">
      {/* 顶部导航 */}
      <div className="flex justify-between items-center bg-gray-800/80 p-5 rounded-3xl border border-gray-700 shadow-2xl backdrop-blur-xl">
        <button onClick={onBack} disabled={isGenerating} className="flex items-center text-gray-400 hover:text-white transition group px-4 py-2 hover:bg-white/5 rounded-2xl disabled:opacity-20">
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
          <span className="font-bold">返回大纲</span>
        </button>
        
        <div className="flex flex-col items-center">
          <div className="text-[10px] font-black text-blue-500 uppercase tracking-[0.3em] mb-1">Seamless Continuity Engine v5.0</div>
          <h2 className="text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-purple-400 to-blue-400">无缝全集生成系统</h2>
        </div>

        <div className="flex bg-gray-900/80 rounded-2xl p-1 border border-gray-700">
           <button onClick={() => setLocalMode('男频')} disabled={isGenerating} className={`px-6 py-2 rounded-xl text-sm font-black transition-all ${localMode === '男频' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}>男频</button>
           <button onClick={() => setLocalMode('女频')} disabled={isGenerating} className={`px-6 py-2 rounded-xl text-sm font-black transition-all ${localMode === '女频' ? 'bg-pink-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}>女频</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* 左侧控制台 */}
        <div className="lg:col-span-3 space-y-6">
          <div className="glass-morphism p-6 rounded-[32px] border border-white/5 space-y-6">
            <h3 className="font-black text-sm text-gray-400 flex items-center space-x-2">
              <span className="w-1.5 h-4 bg-amber-500 rounded-full"></span>
              <span>核心生成策略</span>
            </h3>
            
            <div className="grid grid-cols-1 gap-2">
              <button 
                onClick={() => setLocalStyle('情绪流')}
                disabled={isGenerating}
                className={`p-4 rounded-2xl border text-left transition-all ${localStyle === '情绪流' ? 'bg-red-600/10 border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.2)]' : 'bg-gray-900 border-gray-800'}`}
              >
                <div className={`font-black text-sm ${localStyle === '情绪流' ? 'text-red-400' : 'text-gray-400'}`}>情绪流 (极致冲突)</div>
                <div className="text-[10px] text-gray-500 mt-1">强化打脸爽点，拒绝注水。</div>
              </button>
              <button 
                onClick={() => setLocalStyle('非情绪流')}
                disabled={isGenerating}
                className={`p-4 rounded-2xl border text-left transition-all ${localStyle === '非情绪流' ? 'bg-purple-600/10 border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.2)]' : 'bg-gray-900 border-gray-800'}`}
              >
                <div className={`font-black text-sm ${localStyle === '非情绪流' ? 'text-purple-400' : 'text-gray-400'}`}>非情绪流 (幽默反转)</div>
                <div className="text-[10px] text-gray-500 mt-1">脑洞流、轻松逗趣风格。</div>
              </button>
            </div>

            <button 
              onClick={runAutoGeneration}
              disabled={isGenerating}
              className={`w-full py-6 rounded-3xl font-black transition-all flex flex-col items-center justify-center space-y-2 ${
                isGenerating ? 'bg-amber-500 text-white shadow-amber-500/20' : 'bg-gradient-to-br from-blue-600 to-purple-600 text-white shadow-[0_0_30px_rgba(37,99,235,0.3)] hover:scale-[1.02]'
              }`}
            >
              {isGenerating ? (
                <>
                  <div className="flex items-center space-x-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span className="text-lg">正在执行大纲任务</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-lg">{project.fullScript ? '重新全自动创作' : '一键全自动生成'}</div>
                  <div className="text-[10px] opacity-70">自动分批并确保剧情无缝衔接</div>
                </>
              )}
            </button>

            {/* 正在生成的具体大纲任务展示 */}
            {isGenerating && currentProcessingPhase && (
              <div className="bg-blue-600/10 border border-blue-500/30 p-5 rounded-2xl animate-scaleIn">
                <div className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-2 flex justify-between">
                  <span>当前大纲任务</span>
                  <span>Phase {currentProcessingPhase.phaseIndex}</span>
                </div>
                <div className="text-xs text-gray-200 font-bold leading-relaxed mb-3">
                  {currentProcessingPhase.description}
                </div>
                <div className="flex items-center space-x-2 border-t border-blue-500/20 pt-3">
                   <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-ping"></div>
                   <div className="text-[10px] text-amber-500 font-black uppercase">预期爽点: {currentProcessingPhase.climax}</div>
                </div>
              </div>
            )}

            {project.fullScript && !isGenerating && (
              <button 
                onClick={downloadFullScript}
                className="w-full py-4 bg-gray-800 hover:bg-gray-700 text-blue-400 rounded-2xl font-black text-sm border border-gray-700 flex items-center justify-center space-x-2 transition-all"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                <span>下载完整无缝脚本 (.docx)</span>
              </button>
            )}
          </div>
        </div>

        {/* 右侧预览区 */}
        <div className="lg:col-span-9">
          <div className="glass-morphism rounded-[40px] min-h-[85vh] flex flex-col border border-white/5 shadow-2xl overflow-hidden">
            <div className="bg-gray-900/60 px-10 py-5 border-b border-gray-800/50 flex justify-between items-center backdrop-blur-md">
               <div className="flex items-center space-x-4">
                 <div className={`w-2.5 h-2.5 rounded-full ${isGenerating ? 'bg-amber-500 animate-pulse shadow-amber-500/50' : 'bg-green-500 shadow-green-500/50'} shadow-lg`}></div>
                 <span className="text-xs font-black text-gray-400 uppercase tracking-widest">无缝全景预览</span>
               </div>
               {project.fullScript && (
                 <div className="text-[10px] font-black text-blue-400 bg-blue-900/20 px-3 py-1 rounded-full border border-blue-800/50">
                   已累计完成 {project.fullScript.episodes.length} 集
                 </div>
               )}
            </div>

            <div className="flex-1 p-12 overflow-y-auto custom-scrollbar max-h-[82vh] bg-gray-950/20">
              {!project.fullScript ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-600 space-y-8 py-20 text-center">
                   <div className="w-40 h-40 bg-gray-800/20 rounded-full flex items-center justify-center border-4 border-dashed border-gray-700/30">
                     <svg className="w-20 h-20 opacity-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                   </div>
                   <div className="max-w-md">
                     <p className="text-2xl font-black text-gray-400 tracking-tighter">等待自动化流水线启动</p>
                     <p className="text-sm mt-4 text-gray-500 leading-relaxed font-medium">系统将根据大纲的各个阶段分批进行深度创作。第11集将基于第10集的精确结尾进行逻辑续写。</p>
                   </div>
                </div>
              ) : (
                <div className="space-y-24">
                  {project.fullScript.episodes.map(ep => (
                    <div key={ep.episodeNumber} className="relative group pl-12 animate-fadeIn">
                       <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-500/50 via-purple-500/50 to-transparent rounded-full"></div>
                       <div className="flex items-center space-x-5 mb-8">
                         <div className="bg-amber-600 text-white w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black shadow-lg">#{ep.episodeNumber}</div>
                         <h4 className="text-2xl font-black text-gray-100">{ep.title}</h4>
                         {ep.episodeNumber % 10 === 0 && (
                           <span className="text-[10px] bg-blue-900 text-blue-300 px-2 py-1 rounded border border-blue-700">衔接锚点</span>
                         )}
                       </div>
                       <div className="bg-gray-800/40 p-10 rounded-[48px] border border-white/5 text-lg text-gray-200 leading-[2.2] font-serif whitespace-pre-wrap shadow-2xl backdrop-blur-sm">
                         {ep.content}
                       </div>
                       <div className="mt-8 flex items-center justify-end px-6">
                         <div className="text-[11px] font-black text-gray-600 tracking-[0.2em] uppercase opacity-40">Seamless Link v5 • 第 {ep.episodeNumber} 集完</div>
                       </div>
                    </div>
                  ))}
                  
                  {isGenerating && (
                    <div className="flex justify-center py-20">
                      <div className="flex space-x-2">
                        <div className="w-3 h-3 bg-blue-600 rounded-full animate-bounce"></div>
                        <div className="w-3 h-3 bg-blue-600 rounded-full animate-bounce [animation-delay:-.3s]"></div>
                        <div className="w-3 h-3 bg-blue-600 rounded-full animate-bounce [animation-delay:-.5s]"></div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScriptStage;
