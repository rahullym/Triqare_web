/**
 * Export utilities for CSV and PDF generation
 */

import { SOSRequest } from '@/services/sosService'

/**
 * Convert SOS history data to CSV format
 */
export function exportToCSV(data: SOSRequest[], filename: string = 'sos-history.csv') {
  if (data.length === 0) {
    throw new Error('No data to export')
  }

  // Define CSV headers
  const headers = [
    'SOS ID',
    'Patient Name',
    'Patient Phone',
    'Patient Email',
    'Blood Group',
    'Location',
    'Status',
    'Requested At',
    'Assigned At',
    'Completed At',
    'Response Time (min)',
    'Total Duration (min)',
    'Driver Name',
    'Driver Phone',
    'Driver Email',
    'Auto Assigned',
    'Allergies',
    'Emergency Contact',
    'Emergency Contact Phone'
  ]

  // Helper function to escape CSV values
  const escapeCSV = (value: any): string => {
    if (value === null || value === undefined) return ''
    const stringValue = String(value)
    // Escape quotes and wrap in quotes if contains comma, quote, or newline
    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
      return `"${stringValue.replace(/"/g, '""')}"`
    }
    return stringValue
  }

  // Calculate duration in minutes
  const calculateDuration = (start: string, end: string | null | undefined): string => {
    if (!end) return 'N/A'
    const startTime = new Date(start).getTime()
    const endTime = new Date(end).getTime()
    const diffMs = endTime - startTime
    const diffMins = Math.floor(diffMs / 60000)
    return diffMins.toString()
  }

  // Convert data to CSV rows
  const rows = data.map(sos => [
    escapeCSV(sos.id),
    escapeCSV(sos.patient?.full_name || 'Unknown'),
    escapeCSV(sos.patient?.phone || ''),
    escapeCSV(sos.patient?.email || ''),
    escapeCSV(sos.patient?.blood_group || ''),
    escapeCSV(sos.patient?.address_line || ''),
    escapeCSV(sos.status),
    escapeCSV(new Date(sos.requested_at).toLocaleString()),
    escapeCSV(sos.assigned_at ? new Date(sos.assigned_at).toLocaleString() : ''),
    escapeCSV(sos.completed_at ? new Date(sos.completed_at).toLocaleString() : ''),
    escapeCSV(calculateDuration(sos.requested_at, sos.assigned_at)),
    escapeCSV(calculateDuration(sos.requested_at, sos.completed_at)),
    escapeCSV(sos.assigned_driver?.full_name || ''),
    escapeCSV(sos.assigned_driver?.phone || ''),
    escapeCSV(sos.assigned_driver?.email || ''),
    escapeCSV(sos.auto_assigned ? 'Yes' : 'No'),
    escapeCSV(sos.patient?.allergies || ''),
    escapeCSV(sos.patient?.emergency_contact_name || ''),
    escapeCSV(sos.patient?.emergency_contact_phone || '')
  ])

  // Combine headers and rows
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n')

  // Create and download the file
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  
  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Export SOS history data to PDF format
 */
export async function exportToPDF(data: SOSRequest[], filename: string = 'sos-history.pdf') {
  if (data.length === 0) {
    throw new Error('No data to export')
  }

  // Calculate statistics
  const completedCases = data.filter(h => h.status === 'Arrived at Hospital').length
  const cancelledCases = data.filter(h => h.status === 'Cancelled').length
  const totalCases = data.length
  const successRate = totalCases > 0 ? Math.round((completedCases / totalCases) * 100) : 0

  // Calculate average response time
  const completedWithTimes = data.filter(h => 
    h.status === 'Arrived at Hospital' && h.requested_at && h.assigned_at
  )
  
  let avgResponseTime = 'N/A'
  if (completedWithTimes.length > 0) {
    const totalMinutes = completedWithTimes.reduce((sum, sos) => {
      const requested = new Date(sos.requested_at).getTime()
      const assigned = new Date(sos.assigned_at!).getTime()
      return sum + (assigned - requested) / 60000
    }, 0)
    const avgMinutes = Math.round(totalMinutes / completedWithTimes.length)
    avgResponseTime = `${avgMinutes} min`
  }

  // Create HTML content for PDF
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Emergency Response History Report</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          margin: 20px;
          color: #333;
        }
        .header {
          text-align: center;
          margin-bottom: 30px;
          border-bottom: 3px solid #cc3333;
          padding-bottom: 20px;
        }
        .header h1 {
          color: #cc3333;
          margin: 0;
          font-size: 28px;
        }
        .header p {
          color: #666;
          margin: 5px 0 0 0;
        }
        .stats {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 15px;
          margin-bottom: 30px;
        }
        .stat-card {
          background: #f5f5f5;
          padding: 15px;
          border-radius: 8px;
          text-align: center;
        }
        .stat-card h3 {
          margin: 0;
          font-size: 24px;
          color: #cc3333;
        }
        .stat-card p {
          margin: 5px 0 0 0;
          font-size: 12px;
          color: #666;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 20px;
        }
        th {
          background: #003366;
          color: white;
          padding: 12px 8px;
          text-align: left;
          font-size: 12px;
          font-weight: 600;
        }
        td {
          padding: 10px 8px;
          border-bottom: 1px solid #ddd;
          font-size: 11px;
        }
        tr:nth-child(even) {
          background: #f9f9f9;
        }
        .status-badge {
          display: inline-block;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 600;
        }
        .status-completed {
          background: #d4edda;
          color: #155724;
        }
        .status-cancelled {
          background: #f8d7da;
          color: #721c24;
        }
        .footer {
          margin-top: 30px;
          padding-top: 20px;
          border-top: 2px solid #ddd;
          text-align: center;
          font-size: 11px;
          color: #666;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>🚨 Emergency Response History Report</h1>
        <p>Generated on ${new Date().toLocaleString()}</p>
      </div>

      <div class="stats">
        <div class="stat-card">
          <h3>${totalCases}</h3>
          <p>Total Cases</p>
        </div>
        <div class="stat-card">
          <h3>${completedCases}</h3>
          <p>Completed</p>
        </div>
        <div class="stat-card">
          <h3>${avgResponseTime}</h3>
          <p>Avg Response Time</p>
        </div>
        <div class="stat-card">
          <h3>${successRate}%</h3>
          <p>Success Rate</p>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>SOS ID</th>
            <th>Patient</th>
            <th>Status</th>
            <th>Location</th>
            <th>Requested At</th>
            <th>Driver</th>
            <th>Response Time</th>
          </tr>
        </thead>
        <tbody>
          ${data.map(sos => {
            const responseTime = sos.assigned_at
              ? Math.floor((new Date(sos.assigned_at).getTime() - new Date(sos.requested_at).getTime()) / 60000)
              : null

            return `
              <tr>
                <td style="font-family: monospace; font-size: 10px;">${sos.id.slice(0, 8)}</td>
                <td>
                  <strong>${sos.patient?.full_name || 'Unknown'}</strong><br>
                  <span style="color: #666; font-size: 10px;">${sos.patient?.phone || '-'}</span>
                </td>
                <td>
                  <span class="status-badge ${sos.status === 'Arrived at Hospital' ? 'status-completed' : 'status-cancelled'}">
                    ${sos.status}
                  </span>
                </td>
                <td style="max-width: 150px; font-size: 10px;">${sos.patient?.address_line || 'N/A'}</td>
                <td style="font-size: 10px;">${new Date(sos.requested_at).toLocaleString()}</td>
                <td>${sos.assigned_driver?.full_name || 'Unassigned'}</td>
                <td>${responseTime !== null ? `${responseTime} min` : 'N/A'}</td>
              </tr>
            `
          }).join('')}
        </tbody>
      </table>

      <div class="footer">
        <p><strong>Emergency Response Team</strong> | Confidential Medical Records</p>
        <p>This report contains sensitive patient information. Handle with care.</p>
      </div>
    </body>
    </html>
  `

  // Create a new window and print to PDF
  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    throw new Error('Failed to open print window. Please allow popups for this site.')
  }

  printWindow.document.write(htmlContent)
  printWindow.document.close()

  // Wait for content to load, then trigger print
  printWindow.onload = () => {
    setTimeout(() => {
      printWindow.print()
      // Note: The window will close automatically after printing or canceling
    }, 250)
  }
}

