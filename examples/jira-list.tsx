/**
 * examples/jira-list.tsx — JIRA issue list for Pebble
 */

import { useState, useEffect } from 'preact/hooks';
import { render } from '../src/index.js';
import { Text, Rect, Group, StatusBar } from '../src/components/index.js';
import type { ColorName } from '../src/components/index.js';
import { useButton, useListNavigation } from '../src/hooks/index.js';

interface Issue {
  key: string;
  summary: string;
  status: 'In Progress' | 'To Do' | 'In Review' | 'Done';
  priority: 'High' | 'Medium' | 'Low';
}

const MOCK_ISSUES: Issue[] = [
  { key: 'PROJ-123', summary: 'Fix login timeout', status: 'In Progress', priority: 'High' },
  { key: 'PROJ-124', summary: 'Update dependencies', status: 'To Do', priority: 'Medium' },
  { key: 'PROJ-125', summary: 'Add dark mode toggle', status: 'In Review', priority: 'Low' },
  { key: 'PROJ-126', summary: 'API rate limiting', status: 'In Progress', priority: 'High' },
  { key: 'PROJ-127', summary: 'Refactor auth module', status: 'To Do', priority: 'Medium' },
];

const STATUS_COLORS: Record<Issue['status'], ColorName> = {
  'In Progress': 'blue',
  'To Do': 'darkGray',
  'In Review': 'orange',
  'Done': 'green',
};

interface IssueCardProps {
  issue: Issue;
  isSelected: boolean;
}

function IssueCard({ issue, isSelected }: IssueCardProps) {
  return (
    <Group>
      {isSelected && <Rect x={0} y={0} w={144} h={52} fill="darkGray" />}

      <Text x={4} y={2} w={136} h={18} font="gothic14Bold" color="white">
        {issue.key}
      </Text>

      <Text x={4} y={18} w={136} h={16} font="gothic14" color="lightGray">
        {issue.summary}
      </Text>

      <Text x={4} y={36} w={80} h={14} font="gothic14" color={STATUS_COLORS[issue.status]}>
        {issue.status}
      </Text>

      <Text
        x={100}
        y={36}
        w={40}
        h={14}
        font="gothic14"
        color={issue.priority === 'High' ? 'red' : 'lightGray'}
        align="right"
      >
        {issue.priority}
      </Text>
    </Group>
  );
}

interface IssueDetailProps {
  issue: Issue;
  onBack: () => void;
}

function IssueDetail({ issue, onBack }: IssueDetailProps) {
  useButton('back', onBack);

  return (
    <Group>
      <StatusBar />

      <Rect x={0} y={16} w={144} h={24} fill="white" />
      <Text x={4} y={18} w={136} h={20} font="gothic18Bold" color="black">
        {issue.key}
      </Text>

      <Text x={4} y={46} w={136} h={40} font="gothic18" color="white">
        {issue.summary}
      </Text>

      <Text x={4} y={92} w={60} h={16} font="gothic14" color="lightGray">
        Status:
      </Text>
      <Text x={64} y={92} w={76} h={16} font="gothic14Bold" color="white">
        {issue.status}
      </Text>

      <Text x={4} y={112} w={60} h={16} font="gothic14" color="lightGray">
        Priority:
      </Text>
      <Text
        x={64}
        y={112}
        w={76}
        h={16}
        font="gothic14Bold"
        color={issue.priority === 'High' ? 'red' : 'white'}
      >
        {issue.priority}
      </Text>

      <Text x={4} y={148} w={136} h={16} font="gothic14" color="darkGray" align="center">
        BACK to return
      </Text>
    </Group>
  );
}

type View = 'list' | 'detail';

function JiraApp() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [view, setView] = useState<View>('list');
  const [loading, setLoading] = useState(true);

  const { index, item: selectedIssue } = useListNavigation(issues, { wrap: true });

  useEffect(() => {
    const timer = setTimeout(() => {
      setIssues(MOCK_ISSUES);
      setLoading(false);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  useButton('select', () => {
    if (selectedIssue && view === 'list') {
      setView('detail');
    }
  });

  if (loading) {
    return (
      <Group>
        <Rect x={0} y={0} w={144} h={168} fill="black" />
        <Text x={0} y={70} w={144} h={30} font="gothic18" color="white" align="center">
          Loading...
        </Text>
      </Group>
    );
  }

  if (view === 'detail' && selectedIssue) {
    return <IssueDetail issue={selectedIssue} onBack={() => setView('list')} />;
  }

  const visibleCount = 3;
  const startIdx = Math.max(0, Math.min(index - 1, issues.length - visibleCount));
  const visible = issues.slice(startIdx, startIdx + visibleCount);

  return (
    <Group>
      <StatusBar />

      <Rect x={0} y={16} w={144} h={20} fill="white" />
      <Text x={4} y={17} w={100} h={18} font="gothic14Bold" color="black">
        JIRA Issues
      </Text>
      <Text x={104} y={17} w={36} h={18} font="gothic14" color="darkGray" align="right">
        {index + 1}/{issues.length}
      </Text>

      {visible.map((issue, i) => (
        <Group key={issue.key} x={0} y={38 + i * 54}>
          <IssueCard issue={issue} isSelected={issue === selectedIssue} />
        </Group>
      ))}
    </Group>
  );
}

const app = render(<JiraApp />);

if (app.platform.platform === 'mock') {
  console.log('react-pebble JIRA list example (mock mode)');
  const log = app.drawLog;
  console.log('Draw calls:', log.length);

  const textCalls = log.filter((c: { op: string }) => c.op === 'drawText');
  console.log('Text elements:', textCalls.length);
  for (const call of textCalls) {
    console.log(`  "${String(call.text)}" at (${String(call.x)}, ${String(call.y)})`);
  }

  app.unmount();
}
