import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = {
  title: "소개",
  description: "버모아(VMOA)는 흩어진 한국 버튜버의 실시간 방송 현황을 한 곳에 모아 보여주는 서비스입니다.",
};

export default function AboutPage() {
  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      <PageHeader
        title="버모아 소개"
        description="흩어진 버튜버의 지금을, 한 화면에서."
      />
      <div className="issue-content">
        <p>
          <strong>버모아(VMOA)</strong>는 치지직·SOOP·유튜브 등 여러 플랫폼에
          흩어져 방송하는 한국 버튜버의 <strong>실시간 방송 현황</strong>과
          <strong> 신규 데뷔</strong>, <strong>이슈</strong>를 한 곳에 모아
          보여주는 서비스입니다.
        </p>

        <h2>무엇을 제공하나요</h2>
        <ul>
          <li>지금 방송 중인 버튜버를 플랫폼 구분 없이 한 화면에서</li>
          <li>시청자 평균·피크 기반 랭킹과 실시간 급상승</li>
          <li>새로 데뷔한(처음 감지된) 버튜버</li>
          <li>씬의 주요 이슈 타임라인</li>
        </ul>

        <h2>데이터 출처</h2>
        <p>
          방송 현황 데이터는 각 플랫폼(치지직·SOOP 등)의 공개 정보를 주기적으로
          수집·집계해 제공합니다. 표시되는 수치는 수집 시점 기준이며 실제와
          차이가 있을 수 있습니다. 모든 채널·방송의 권리는 각 크리에이터와
          플랫폼에 있습니다.
        </p>

        <h2>문의</h2>
        <p>
          제휴·정보 수정·삭제 요청 등은 <a href="/contact">문의 페이지</a>를
          통해 연락 주세요.
        </p>
      </div>
    </div>
  );
}
