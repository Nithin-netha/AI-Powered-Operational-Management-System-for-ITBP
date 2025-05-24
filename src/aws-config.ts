import { Amplify } from 'aws-amplify';

const awsConfig = {
    Auth: {
        Cognito: {
            userPoolId: 'ap-south-1_94159B0Ie',
            userPoolClientId: '5q5hq245ak4lp4a92nb5dcil4c',
            region: 'ap-south-1',
            signUpVerificationMethod: 'code' as const,
            loginWith: {
                email: true,
                phone: false,
                username: true
            }
        }
    }
} as const;

Amplify.configure(awsConfig);

export default awsConfig; 