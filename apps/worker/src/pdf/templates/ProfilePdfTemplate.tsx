import React from 'react';
import { Document, Page, Text, View, StyleSheet, Link } from '@react-pdf/renderer';

export interface EducationEntry {
  degree: string;
  institution: string;
  year?: string;
}

export interface ExperienceEntry {
  title: string;
  company: string;
  duration?: string;
  description?: string;
}

export interface ProfilePdfProps {
  seekerId: string;
  fullName: string;
  seekerType: string;
  city: string;
  state?: string;
  skills: string[];
  summary?: string;
  education?: EducationEntry[];
  experience?: ExperienceEntry[];
  verificationUrl?: string;
}

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Noto Sans Devanagari',
    paddingTop: 36,
    paddingBottom: 60,
    paddingHorizontal: 36,
    backgroundColor: '#ffffff',
    color: '#1f2937',
    fontSize: 10,
    lineHeight: 1.5,
  },
  header: {
    borderBottomWidth: 2,
    borderBottomColor: '#2563eb',
    borderBottomStyle: 'solid',
    paddingBottom: 12,
    marginBottom: 16,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  name: {
    fontSize: 22,
    fontWeight: 700,
    color: '#0f172a',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 11,
    color: '#475569',
    marginBottom: 4,
  },
  metaText: {
    fontSize: 9,
    color: '#64748b',
  },
  badge: {
    backgroundColor: '#dbeafe',
    color: '#1e40af',
    fontSize: 8,
    fontWeight: 700,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  section: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: '#1e3a8a',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    borderBottomStyle: 'solid',
    paddingBottom: 3,
    marginBottom: 6,
  },
  summaryText: {
    fontSize: 9.5,
    color: '#334155',
    lineHeight: 1.4,
  },
  skillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  skillBadge: {
    backgroundColor: '#f1f5f9',
    color: '#0f172a',
    fontSize: 8.5,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderStyle: 'solid',
    marginRight: 6,
    marginBottom: 6,
  },
  itemBlock: {
    marginBottom: 6,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  itemTitle: {
    fontSize: 9.5,
    fontWeight: 700,
    color: '#0f172a',
  },
  itemSub: {
    fontSize: 9,
    color: '#475569',
  },
  itemDate: {
    fontSize: 8,
    color: '#64748b',
  },
  itemDesc: {
    fontSize: 8.5,
    color: '#334155',
    marginTop: 2,
  },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 36,
    right: 36,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    borderTopStyle: 'solid',
    paddingTop: 8,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 8,
    color: '#64748b',
  },
  verificationLink: {
    fontSize: 8,
    color: '#2563eb',
    textDecoration: 'underline',
  },
  privacyNotice: {
    fontSize: 7,
    color: '#94a3b8',
    marginTop: 3,
  },
});

export const ProfilePdfTemplate = (props: ProfilePdfProps): React.ReactElement<React.ComponentProps<typeof Document>> => {
  const verificationUrl = props.verificationUrl || `https://indianjobportal.in/seeker/${props.seekerId}`;
  const location = props.state ? `${props.city}, ${props.state}` : props.city;

  return (
    <Document title={`${props.fullName} - Resume`}>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View>
              <Text style={styles.name}>{props.fullName}</Text>
              <Text style={styles.subtitle}>
                {props.seekerType.toUpperCase()} • {location}
              </Text>
            </View>
            <View>
              <Text style={styles.badge}>VERIFIED PROFILE / सत्यापित</Text>
            </View>
          </View>
          <Text style={styles.metaText}>
            ID: {props.seekerId}
          </Text>
        </View>

        {/* Profile Summary */}
        {props.summary ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Overview / विवरण</Text>
            <Text style={styles.summaryText}>{props.summary}</Text>
          </View>
        ) : null}

        {/* Skills */}
        {props.skills && props.skills.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Key Skills / कौशल</Text>
            <View style={styles.skillsRow}>
              {props.skills.map((skill: string, index: number) => (
                <Text key={index} style={styles.skillBadge}>
                  {skill}
                </Text>
              ))}
            </View>
          </View>
        ) : null}

        {/* Experience */}
        {props.experience && props.experience.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Work Experience / कार्य अनुभव</Text>
            {props.experience.map((exp: ExperienceEntry, index: number) => (
              <View key={index} style={styles.itemBlock}>
                <View style={styles.itemHeader}>
                  <Text style={styles.itemTitle}>{exp.title}</Text>
                  {exp.duration ? <Text style={styles.itemDate}>{exp.duration}</Text> : null}
                </View>
                <Text style={styles.itemSub}>{exp.company}</Text>
                {exp.description ? <Text style={styles.itemDesc}>{exp.description}</Text> : null}
              </View>
            ))}
          </View>
        ) : null}

        {/* Education */}
        {props.education && props.education.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Education & Qualifications / शिक्षा</Text>
            {props.education.map((edu: EducationEntry, index: number) => (
              <View key={index} style={styles.itemBlock}>
                <View style={styles.itemHeader}>
                  <Text style={styles.itemTitle}>{edu.degree}</Text>
                  {edu.year ? <Text style={styles.itemDate}>{edu.year}</Text> : null}
                </View>
                <Text style={styles.itemSub}>{edu.institution}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Footer with Clickable Verification Link & Privacy Invariant */}
        <View style={styles.footer} fixed>
          <View style={styles.footerRow}>
            <Text style={styles.footerText}>
              Indian Job Portal (रोजगार संगम)
            </Text>
            <Link src={verificationUrl} style={styles.verificationLink}>
              Verify Profile: {verificationUrl}
            </Link>
          </View>
          <Text style={styles.privacyNotice}>
            Invariant Protected: Direct phone/email hidden. Employer contact enabled only via platform messaging.
          </Text>
        </View>
      </Page>
    </Document>
  );
};
