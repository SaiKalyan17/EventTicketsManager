import { useState } from 'react'
import { useEvent } from '@/hooks/useEvent'
import { useAsync } from '@/hooks/useAsync'
import { api } from '@/lib/api'
import { fmtDateTime, formatSerial } from '@/lib/utils'
import { Badge, Card } from '@/components/ui/card'
import { EmptyState, ErrorState, PageHeader, Pagination } from '@/components/ui/feedback'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { PassTypeBadge } from '@/components/epass/TicketList'

const PAGE = 25
const RESULT = {
  entered: <Badge variant="success">Entered</Badge>,
  already_entered: <Badge variant="warning">Already entered</Badge>,
  cancelled: <Badge variant="danger">Rejected – cancelled</Badge>,
}

export default function Entries() {
  const { event } = useEvent()
  const [page, setPage] = useState(0)
  const { data, loading, error, reload } = useAsync(() => api.listEntryLogs(event!.id, PAGE, page * PAGE), [event?.id, page])
  return (
    <div>
      <PageHeader title="Entry history" subtitle="Every scan attempt is logged permanently and cannot be edited" />
      {error ? <ErrorState message={error} onRetry={reload} /> : (
        <Card className="overflow-hidden">
          {!loading && data?.length === 0 ? <EmptyState title="No scans yet" hint="Entries appear here as soon as tickets are scanned." /> : (
            <>
              <Table>
                <THead><TR><TH>Time</TH><TH>Serial</TH><TH>Customer</TH><TH>Type</TH><TH>Result</TH><TH>Checked by</TH></TR></THead>
                <TBody>
                  {(data ?? []).map((l) => (
                    <TR key={l.id}>
                      <TD className="whitespace-nowrap">{fmtDateTime(l.created_at)}</TD>
                      <TD className="font-mono font-bold tracking-wider">{formatSerial(l.serial_number)}</TD>
                      <TD>{l.customer_name}</TD><TD><PassTypeBadge type={l.pass_type} /></TD>
                      <TD>{RESULT[l.result]}</TD><TD>{l.admin_name}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              <Pagination page={page} pageSize={PAGE} total={Number(data?.[0]?.total_count ?? 0)} onPage={setPage} loading={loading} />
            </>
          )}
        </Card>
      )}
    </div>
  )
}
