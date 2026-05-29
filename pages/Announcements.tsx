import React from 'react';
import { Navigate } from 'react-router-dom';

const AnnouncementsPage: React.FC = () => {
  return <Navigate to="/farmer-MyAnnouncement" replace />;
};

export default AnnouncementsPage;
