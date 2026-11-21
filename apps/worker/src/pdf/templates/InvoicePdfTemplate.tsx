import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

export interface InvoicePdfProps {
  invoiceNumber: string;
  kind: 'invoice' | 'credit_note';
  fy: string;
  issuedAt: string;
  supplier: {
    legalName: string;
    gstin: string;
    stateCode: string;
    address: string;
    sac: string;
  };
  buyer: {
    name: string;
    gstin?: string | null;
    stateCode?: string | null;
    address?: string | null;
  };
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
  description: string;
}

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Noto Sans Devanagari',
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 36,
    backgroundColor: '#ffffff',
    color: '#1f2937',
    fontSize: 9,
    lineHeight: 1.4,
  },
  header: {
    borderBottomWidth: 2,
    borderBottomColor: '#1d4ed8',
    borderBottomStyle: 'solid',
    paddingBottom: 12,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    color: '#1e3a8a',
  },
  subtitle: {
    fontSize: 10,
    color: '#4b5563',
    marginTop: 2,
  },
  metaRight: {
    alignItems: 'flex-end',
  },
  invoiceNo: {
    fontSize: 11,
    fontWeight: 700,
    color: '#111827',
  },
  metaText: {
    fontSize: 9,
    color: '#4b5563',
    marginTop: 2,
  },
  partiesGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  partyBox: {
    width: '48%',
    padding: 10,
    backgroundColor: '#f9fafb',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderStyle: 'solid',
  },
  partyTitle: {
    fontSize: 10,
    fontWeight: 700,
    color: '#1f2937',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  partyLine: {
    fontSize: 9,
    color: '#374151',
    marginTop: 2,
  },
  table: {
    width: '100%',
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderStyle: 'solid',
    borderRadius: 4,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    borderBottomStyle: 'solid',
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontWeight: 700,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    borderBottomStyle: 'solid',
  },
  colDesc: { width: '35%' },
  colSac: { width: '13%', textAlign: 'center' },
  colTaxable: { width: '16%', textAlign: 'right' },
  colTax: { width: '18%', textAlign: 'right' },
  colTotal: { width: '18%', textAlign: 'right' },
  totalRow: {
    flexDirection: 'row',
    backgroundColor: '#f9fafb',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: '#d1d5db',
    borderTopStyle: 'solid',
    fontWeight: 700,
  },
  footer: {
    marginTop: 24,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    borderTopStyle: 'solid',
    fontSize: 8,
    color: '#6b7280',
    textAlign: 'center',
  },
});

function formatInr(paise: number): string {
  return `₹${(paise / 100).toFixed(2)}`;
}

export function InvoicePdfTemplate(props: InvoicePdfProps) {
  const isCreditNote = props.kind === 'credit_note';
  const docTitle = isCreditNote ? 'CREDIT NOTE / क्रेडिट नोट' : 'TAX INVOICE / कर चालान';
  const formattedDate = new Date(props.issuedAt).toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Kolkata',
  });

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>{docTitle}</Text>
            <Text style={styles.subtitle}>Original for Recipient</Text>
          </View>
          <View style={styles.metaRight}>
            <Text style={styles.invoiceNo}>
              {isCreditNote ? 'CN No: ' : 'Invoice No: '}
              {props.invoiceNumber}
            </Text>
            <Text style={styles.metaText}>Date: {formattedDate}</Text>
            <Text style={styles.metaText}>Financial Year: {props.fy}</Text>
          </View>
        </View>

        {/* Supplier and Buyer Details */}
        <View style={styles.partiesGrid}>
          <View style={styles.partyBox}>
            <Text style={styles.partyTitle}>Supplier / आपूर्तिकर्ता</Text>
            <Text style={styles.partyLine}>{props.supplier.legalName}</Text>
            <Text style={styles.partyLine}>GSTIN: {props.supplier.gstin}</Text>
            <Text style={styles.partyLine}>State Code: {props.supplier.stateCode}</Text>
            <Text style={styles.partyLine}>{props.supplier.address}</Text>
          </View>
          <View style={styles.partyBox}>
            <Text style={styles.partyTitle}>Billed To / प्राप्तकर्ता</Text>
            <Text style={styles.partyLine}>{props.buyer.name || 'Customer'}</Text>
            {props.buyer.gstin ? (
              <Text style={styles.partyLine}>GSTIN: {props.buyer.gstin}</Text>
            ) : null}
            <Text style={styles.partyLine}>
              State Code: {props.buyer.stateCode || props.supplier.stateCode}
            </Text>
            {props.buyer.address ? (
              <Text style={styles.partyLine}>{props.buyer.address}</Text>
            ) : null}
          </View>
        </View>

        {/* Line Items Table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.colDesc}>Description / विवरण</Text>
            <Text style={styles.colSac}>SAC Code</Text>
            <Text style={styles.colTaxable}>Taxable Amt</Text>
            <Text style={styles.colTax}>GST Amount</Text>
            <Text style={styles.colTotal}>Total Amt</Text>
          </View>

          <View style={styles.tableRow}>
            <Text style={styles.colDesc}>{props.description}</Text>
            <Text style={styles.colSac}>{props.supplier.sac}</Text>
            <Text style={styles.colTaxable}>{formatInr(props.taxablePaise)}</Text>
            <Text style={styles.colTax}>
              {props.igstPaise > 0
                ? `IGST (18%): ${formatInr(props.igstPaise)}`
                : `CGST (9%): ${formatInr(props.cgstPaise)}\nSGST (9%): ${formatInr(props.sgstPaise)}`}
            </Text>
            <Text style={styles.colTotal}>{formatInr(props.totalPaise)}</Text>
          </View>

          <View style={styles.totalRow}>
            <Text style={styles.colDesc}>Total / कुल</Text>
            <Text style={styles.colSac}>-</Text>
            <Text style={styles.colTaxable}>{formatInr(props.taxablePaise)}</Text>
            <Text style={styles.colTax}>
              {formatInr(props.cgstPaise + props.sgstPaise + props.igstPaise)}
            </Text>
            <Text style={styles.colTotal}>{formatInr(props.totalPaise)}</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text>This is a computer generated invoice and does not require a physical signature.</Text>
          <Text style={{ marginTop: 2 }}>
            GST payable on reverse charge basis: No | Services under SAC 998311
          </Text>
        </View>
      </Page>
    </Document>
  );
}
