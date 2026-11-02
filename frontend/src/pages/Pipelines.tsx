import {useEffect,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {ArrowUpRight,FileCode2,GitBranch,GitPullRequest,Plus,RefreshCw,Workflow} from 'lucide-react';
import {api,useAction,type Dashboard,type Item} from '../api';
import {ErrorNotice,Empty,PageTitle,Panel,Status,Submit} from '../components/ui';
import './pipelines.css';

type WorkflowFile={path:string;name:string;state?:string};
type WorkflowContent=WorkflowFile&{content:string;sha?:string;branch:string};
type WorkflowPublishResult={sample?:boolean;html_url?:string;branch?:string};
const starter=`name: CI/CD

on:
  pull_request:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

jobs:
  build:
    name: Build and test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      # Add stack-specific setup and build commands here.

  code_review:
    name: Code review gate
    needs: build
    runs-on: ubuntu-latest
    environment: code-review
    steps:
      - run: echo "Configure required reviewers on the code-review environment."

  security_scan:
    name: Security scans
    needs: code_review
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: semgrep/semgrep-action@v1
        with:
          config: auto
      - uses: gitleaks/gitleaks-action@v2
      - uses: aquasecurity/trivy-action@0.36.0
        with:
          scan-type: fs
          severity: CRITICAL
          exit-code: "1"
      - uses: google/osv-scanner-action/osv-scanner-action@v2.0.2
        with:
          scan-args: "--recursive ."

  deploy:
    name: Deployment (configure provider first)
    needs: security_scan
    if: false
    runs-on: ubuntu-latest
    steps:
      - run: echo "Add the selected deployment provider action before enabling this job."
`;

export default function Pipelines({data}:{data:Dashboard}){
 const availableProjects=data.project.filter(p=>p.repositories?.length);
 const [projectId,setProjectId]=useState(availableProjects[0]?.id||'');
 const project=availableProjects.find(p=>p.id===projectId) as Item|undefined;
 const [repo,setRepo]=useState(project?.repositories?.[0]||'');
 const [path,setPath]=useState('');
 const [content,setContent]=useState('');
 const [mode,setMode]=useState<'pull_request'|'direct'>('pull_request');
 const [branch,setBranch]=useState('');
 const [editing,setEditing]=useState(false);
 const [notice,setNotice]=useState('');
 const repoFiles=(project?.repositories||[]) as string[];
 const workflows=useQuery<{workflows:WorkflowFile[]}>({queryKey:['workflows',projectId,repo],queryFn:()=>api(`/projects/${projectId}/workflows?repo=${encodeURIComponent(repo)}`),enabled:Boolean(projectId&&repo)});
 const runs=useQuery<{workflow_runs:Item[]}>({queryKey:['builds',projectId,repo],queryFn:()=>api(`/projects/${projectId}/builds?repo=${encodeURIComponent(repo)}`),enabled:Boolean(projectId&&repo)});
 const selected=workflows.data?.workflows.find(w=>w.path===path);
 const file=useQuery<WorkflowContent>({queryKey:['workflow',projectId,repo,path],queryFn:()=>api(`/projects/${projectId}/workflows/content?repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(path)}`),enabled:Boolean(projectId&&repo&&path&&!editing)});
 const action=useAction<WorkflowPublishResult>();
 useEffect(()=>{setRepo(project?.repositories?.[0]||'');setPath('');setEditing(false)},[projectId]);
 useEffect(()=>{if(file.data){setContent(file.data.content);setBranch(file.data.branch)}},[file.data]);
 const startNew=()=>{setPath('.github/workflows/cicd.yml');setContent(starter.replace('branches: [main]',`branches: [${JSON.stringify(project?.branch||'main')}]`));setEditing(true);setNotice('')};
 const startEdit=()=>{if(!selected)return;setPath(selected.path);setEditing(true);setNotice('')};
 const save=async(e:React.FormEvent)=>{e.preventDefault();try{const result=await action.mutateAsync({path:`/projects/${projectId}/workflows`,method:'PATCH',body:{repo,path,content,mode,branch:mode==='direct'?branch:undefined}});setEditing(false);setNotice(result.sample?'Sample mode: workflow edit simulated; no file changed and no pull request was created.':mode==='pull_request'?`Pull request created: ${result.html_url}`:'Workflow updated on the selected branch.');await workflows.refetch()}catch{}};
 if(!availableProjects.length)return <><PageTitle title="Pipelines" description="Manage the GitHub Actions workflows that build, review, scan, and deploy your repositories."/><Empty title="No managed project repositories" text="Add a project and manage one or more repositories to edit workflows here."/></>;
 return <><PageTitle title="Pipelines" description="Jobs, workflow files, and their path from build through review, scanning, and deployment." action={['owner','admin'].includes(data.user?.role)&&<button className="button primary" onClick={startNew}><Plus size={16}/>New workflow</button>}/><div className="pipeline-toolbar"><label>Project<select value={projectId} onChange={e=>setProjectId(e.target.value)}>{availableProjects.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label><label>Repository<select value={repo} onChange={e=>{setRepo(e.target.value);setPath('');setEditing(false)}}>{repoFiles.map(name=><option key={name}>{name}</option>)}</select></label><button className="button" disabled={workflows.isFetching||runs.isFetching} onClick={()=>{workflows.refetch();runs.refetch()}}><RefreshCw size={15} className={workflows.isFetching||runs.isFetching?'spin':''}/>Refresh</button></div><ErrorNotice error={workflows.error||file.error||runs.error||action.error}/>{notice&&<div className="recommendation"><div><b>{notice.startsWith('Sample mode:')?'Sample mode':notice.startsWith('Pull request created:')?'Workflow pull request created':'Workflow saved'}</b><p>{notice.startsWith('Pull request created:')?<a className="external" href={notice.slice('Pull request created:'.length).trim()} target="_blank" rel="noreferrer">Open pull request <ArrowUpRight size={14}/></a>:notice}</p></div></div>}<div className="pipeline-layout"><Panel title={<><Workflow size={18}/>Workflow files</>} subtitle={`${repo} · ${workflows.data?.workflows.length||0} workflows`}><div className="workflow-list">{workflows.data?.workflows.map(w=><button key={w.path} className={path===w.path?'workflow-file selected':'workflow-file'} onClick={()=>{setPath(w.path);setEditing(false);setNotice('')}}><FileCode2 size={16}/><span><b>{w.name}</b><small>{w.path}</small></span><Status value={w.state||'configured'}/></button>)}</div>{!workflows.isLoading&&!workflows.data?.workflows.length&&<Empty title="No workflow files found" text="Create a starter workflow or add an existing .yml/.yaml file under .github/workflows/."/>}</Panel><Panel title={editing?(selected?'Edit workflow':'New workflow'):(selected?.name||'Workflow editor')} subtitle={editing?'Review the YAML carefully before publishing it.':'Select a workflow to inspect or edit its source.'} action={selected&&!editing&&['owner','admin'].includes(data.user?.role)&&<button className="button small" onClick={startEdit}><FileCode2 size={14}/>Edit workflow</button>}>{editing?<form className="workflow-editor padding" onSubmit={save}><label>Workflow path<input required pattern="\\.github/workflows/[^/]+\\.ya?ml" value={path} onChange={e=>setPath(e.target.value)}/></label><label>Workflow YAML<textarea className="workflow-source" spellCheck={false} required rows={22} value={content} onChange={e=>setContent(e.target.value)}/></label><div className="workflow-stages"><span>Common stages</span>{['Build','Code review','Security scan','Deploy'].map(s=><span className="stage-chip" key={s}>{s}</span>)}</div><label>Publish changes<select value={mode} onChange={e=>setMode(e.target.value as 'pull_request'|'direct')}><option value="pull_request">Create a pull request (recommended)</option><option value="direct">Write directly to a branch</option></select></label>{mode==='direct'&&<label>Target branch<input required value={branch} onChange={e=>setBranch(e.target.value)} placeholder="main"/></label>}<ErrorNotice error={action.error}/><div className="modal-actions"><button type="button" className="button" onClick={()=>{setEditing(false);setPath('')}}>Cancel</button><Submit pending={action.isPending}>{mode==='pull_request'?<><GitPullRequest size={15}/>Create pull request</>:'Save to branch'}</Submit></div></form>:selected?<div className="workflow-read"><div className="row gap"><GitBranch size={15}/><code>{file.data?.branch||project?.branch}</code></div>{file.isLoading?<p className="muted">Loading workflow…</p>:<pre className="workflow-source">{file.data?.content}</pre>}</div>:<Empty title="Choose a workflow" text="Select a workflow file to inspect it, or create a new workflow."/ >}</Panel></div><Panel title="Recent pipeline runs" subtitle="Latest GitHub Actions runs for the selected project."><ErrorNotice error={runs.error}/>{runs.data?.workflow_runs?.length?runs.data.workflow_runs.slice(0,12).map((run:any)=><div className="simple-row" key={run.id}><div><b>{run.name||run.commit||'Workflow run'}</b><small>{run.head_branch||run.branch||'—'} · {run.actor?.login||run.actor||'—'} · {run.head_sha?.slice(0,7)||run.commit||'—'}</small></div><Status value={run.conclusion||run.status}/>{run.html_url&&<a className="external" href={run.html_url} target="_blank" rel="noreferrer">View run <ArrowUpRight size={14}/></a>}</div>):!runs.isLoading&&<Empty title="No pipeline runs yet" text="Workflow runs will appear here after GitHub Actions runs for this repository."/>}</Panel><Panel title="Pipeline stage model" subtitle="Stages are defined by the workflow file and run on GitHub Actions."><div className="pipeline-stage-row">{[['Build','Compile and test changes'],['Code review','Add a repository-approved review provider'],['Security scan','Run configured security scanners'],['Deploy','Publish to the selected environment']].map(([name,desc],i)=><div className="pipeline-stage-card" key={name}><span>{String(i+1).padStart(2,'0')}</span><b>{name}</b><small>{desc}</small></div>)}</div><p className="help">The editor changes workflow YAML through GitHub. Pull requests are the default so workflow changes receive normal repository review; direct branch updates are available when permitted.</p></Panel></>;
}
