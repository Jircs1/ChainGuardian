import * as React from "react";

export interface IButtonProps {
    disabled?: boolean;
    onClick?: () => {};
}
export interface IBaseButtonProps extends IButtonProps{
    buttonType: string;
}
const TYPES = {
    PRIMITIVE: "primitive",
    PRIMARY: "primary",
    SECONDARY: "secondary",
    INVERTED: "inverted",
    DESTRUCTIVE: "destructive",
};

const BaseButton: React.FunctionComponent<IBaseButtonProps> = ({
    children,
    disabled,
    onClick,
    buttonType,
}) => (<button 
    className={`button btn-${buttonType}`} 
    disabled={disabled} 
    onClick={onClick}>
    {children}
    </button>);

export const ButtonPrimitive: React.FunctionComponent<React.PropsWithChildren<IButtonProps>> = ({children, disabled, onClick}) => {
    return(<BaseButton disabled={disabled} onClick={onClick} buttonType={TYPES.PRIMITIVE}>{children}</BaseButton>);
};
export const ButtonPrimary: React.FunctionComponent<React.PropsWithChildren<IButtonProps>> = ({children, disabled, onClick}) => {
    return(<BaseButton disabled={disabled} onClick={onClick} buttonType={TYPES.PRIMARY}>{children}</BaseButton>);
};
export const ButtonSecondary: React.FunctionComponent<React.PropsWithChildren<IButtonProps>> = ({children, disabled, onClick}) => {
    return(<BaseButton disabled={disabled} onClick={onClick} buttonType={TYPES.SECONDARY}>{children}</BaseButton>);
};
export const ButtonInverted: React.FunctionComponent<React.PropsWithChildren<IButtonProps>> = ({children, disabled, onClick}) => {
    return(<BaseButton disabled={disabled} onClick={onClick} buttonType={TYPES.INVERTED}>{children}</BaseButton>);
};
export const ButtonDestructive: React.FunctionComponent<React.PropsWithChildren<IButtonProps>> = ({children, disabled, onClick}) => {
    return(<BaseButton disabled={disabled} onClick={onClick} buttonType={TYPES.DESTRUCTIVE}>{children}</BaseButton>);
};