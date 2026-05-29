import React from 'react';
import Announcements from '../components/Announcements';

const FarmerMyAnnouncement: React.FC = () => {
  const role = localStorage.getItem('userRole') || 'public';
  const authToken = localStorage.getItem('authToken') || '';
  return <Announcements userRole={role} authToken={authToken} />;
};

export default FarmerMyAnnouncement;
